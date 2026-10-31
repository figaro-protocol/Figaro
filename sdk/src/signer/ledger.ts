/**
 * @figaro-protocol/sdk/signer — Ledger custody (second custody mode).
 *
 * The key stays on the device; the daemon sends it APDUs for the Ledger
 * Ethereum app and reads back signatures:
 *   - GET_ETH_PUBLIC_ADDRESS (INS 0x02) — the wallet, checked against the
 *     device's own public key;
 *   - SIGN_TX (INS 0x04) — the unsigned serialized transaction, in chunks of
 *     at most 255 bytes, the BIP-32 path in front of the first;
 *   - SIGN_EIP712_HASHED (INS 0x0C) — the domain separator and the message's
 *     struct hash (the device shows both hashes, not the decoded fields).
 * Every signature is recovered against the device's address before it is
 * returned, and a signed transaction's sender is recovered from the
 * serialized bytes that leave: a reply that does not recover is refused,
 * whatever the device said. The transport is injected — `exchange(apdu) → reply` — so the
 * daemon's CLI supplies the HID transport and tests supply a mock.
 */

import {
    concat, domainSeparator as hashDomainSeparator, hashStruct, hashTypedData, keccak256, recoverAddress, serializeTransaction, toHex,
    getAddress, getTransactionType, recoverTransactionAddress, type Address, type Hex, type TransactionSerializable,
} from "viem";
import type { SignerCustody } from "./custody.js";

/** The one call a Ledger transport makes: an APDU out, the reply (with its
 *  two status-word bytes at the end) back. `@ledgerhq/hw-transport-node-hid`
 *  `Transport#exchange` has this shape. */
export interface LedgerTransport {
    exchange(apdu: Uint8Array): Promise<Uint8Array>;
}

export interface LedgerCustodyOptions {
    transport: LedgerTransport;
    /** BIP-32 derivation path; `m/44'/60'/0'/0/0` unless named. */
    path?: string;
}

export const DEFAULT_LEDGER_PATH = "m/44'/60'/0'/0/0";

const CLA = 0xe0;
const INS_GET_ADDRESS = 0x02;
const INS_SIGN_TX = 0x04;
const INS_SIGN_EIP712_HASHED = 0x0c;
const MAX_CHUNK = 255;

const STATUS: Record<number, string> = {
    0x6985: "refused on the device",
    0x6a80: "the device refused the data",
    0x6d00: "the Ethereum app is not open on the device",
    0x6e00: "the Ethereum app is not open on the device",
    0x5515: "the device is locked",
};

/** A BIP-32 path as the app reads it: a count byte, then each component as
 *  4 bytes big-endian, hardened components with the top bit set. */
export function encodeBip32Path(p: string): Uint8Array {
    if (!p.startsWith("m/")) throw new Error(`ledger: a derivation path starts with m/ — ${p}`);
    const parts = p.slice(2).split("/");
    const out = new Uint8Array(1 + 4 * parts.length);
    out[0] = parts.length;
    parts.forEach((part, i) => {
        const hardened = part.endsWith("'");
        const n = Number(hardened ? part.slice(0, -1) : part);
        if (!Number.isInteger(n) || n < 0 || n >= 0x80000000) {
            throw new Error(`ledger: not a path component: ${part}`);
        }
        new DataView(out.buffer).setUint32(1 + 4 * i, hardened ? (n | 0x80000000) >>> 0 : n);
    });
    return out;
}

function apdu(ins: number, p1: number, data: Uint8Array): Uint8Array {
    if (data.length > MAX_CHUNK) throw new Error("ledger: an APDU carries at most 255 bytes");
    return new Uint8Array([CLA, ins, p1, 0x00, data.length, ...data]);
}

async function send(transport: LedgerTransport, ins: number, p1: number, data: Uint8Array): Promise<Uint8Array> {
    const reply = await transport.exchange(apdu(ins, p1, data));
    if (reply.length < 2) throw new Error("ledger: the device sent no status word");
    const sw = (reply[reply.length - 2] << 8) | reply[reply.length - 1];
    if (sw !== 0x9000) {
        const hex = `0x${sw.toString(16).padStart(4, "0")}`;
        throw new Error(`ledger: status ${hex} — ${STATUS[sw] ?? "the device refused the request"}`);
    }
    return reply.slice(0, -2);
}

/** A `v r s` reply: v's low bit is not trusted — the parity is the one whose
 *  recovery is the device's address. */
async function recoverParity(hash: Hex, reply: Uint8Array, address: Address): Promise<{ r: Hex; s: Hex; yParity: 0 | 1 }> {
    if (reply.length < 65) throw new Error("ledger: the device's signature is short");
    const r = toHex(reply.slice(1, 33));
    const s = toHex(reply.slice(33, 65));
    for (const yParity of [0, 1] as const) {
        const signer = await recoverAddress({ hash, signature: { r, s, yParity } }).catch(() => null);
        if (signer && signer.toLowerCase() === address.toLowerCase()) return { r, s, yParity };
    }
    throw new Error("ledger: the device's signature does not recover to its address — refused");
}

/**
 * Open Ledger custody: read the device's address at `path`, verified against
 * the public key the device returns beside it, and return the custody the
 * daemon signs through.
 */
export async function ledgerCustody(opts: LedgerCustodyOptions): Promise<SignerCustody> {
    const { transport } = opts;
    const pathBytes = encodeBip32Path(opts.path ?? DEFAULT_LEDGER_PATH);

    const reply = await send(transport, INS_GET_ADDRESS, 0x00, pathBytes);
    const pubLen = reply[0];
    const pub = reply.slice(1, 1 + pubLen);
    const addrLen = reply[1 + pubLen];
    const addrText = new TextDecoder().decode(reply.slice(2 + pubLen, 2 + pubLen + addrLen));
    if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("ledger: the device's public key is not uncompressed secp256k1");
    const derived = getAddress(`0x${keccak256(pub.slice(1)).slice(-40)}`);
    if (derived.toLowerCase() !== `0x${addrText}`.toLowerCase()) {
        throw new Error("ledger: the device's address is not its public key's — refused");
    }
    const address = derived;

    return {
        address,
        async signTypedData(typedData) {
            const td = typedData as unknown as {
                domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown>;
            };
            const domainSeparator = hashDomainSeparator({ domain: td.domain } as never);
            const structHash = hashStruct({ data: td.message, primaryType: td.primaryType, types: td.types } as never);
            const sig = await send(transport, INS_SIGN_EIP712_HASHED, 0x00, new Uint8Array([
                ...pathBytes, ...hexBytes(domainSeparator), ...hexBytes(structHash),
            ]));
            const hash = hashTypedData(typedData as never);
            const { r, s, yParity } = await recoverParity(hash, sig, address);
            return concat([r, s, toHex(27 + yParity, { size: 1 })]);
        },
        async signTransaction(tx: TransactionSerializable) {
            const unsigned = hexBytes(serializeTransaction(tx));
            const payload = new Uint8Array([...pathBytes, ...unsigned]);
            let sig: Uint8Array = new Uint8Array();
            for (let at = 0; at < payload.length; at += MAX_CHUNK) {
                sig = await send(transport, INS_SIGN_TX, at === 0 ? 0x00 : 0x80, payload.slice(at, at + MAX_CHUNK));
            }
            const { r, s, yParity } = await recoverParity(keccak256(unsigned), sig, address);
            // The type is the serializer's own reading of `tx` (an untyped tx
            // with gasPrice and accessList is eip2930, not legacy): only a
            // legacy tx takes an EIP-155 v, every typed one takes yParity.
            const signed = getTransactionType(tx) === "legacy"
                ? serializeTransaction(tx, {
                    r, s, v: tx.chainId !== undefined ? BigInt(tx.chainId) * 2n + 35n + BigInt(yParity) : 27n + BigInt(yParity),
                })
                : serializeTransaction(tx, { r, s, yParity });
            // What leaves is what was checked: the serialized tx's sender.
            const sender = await recoverTransactionAddress({ serializedTransaction: signed as never }).catch(() => null);
            if (!sender || sender.toLowerCase() !== address.toLowerCase()) {
                throw new Error("ledger: the signed transaction's sender is not the device's address — refused");
            }
            return signed;
        },
    };
}

function hexBytes(h: Hex): Uint8Array {
    return Uint8Array.from(Buffer.from(h.slice(2), "hex"));
}
