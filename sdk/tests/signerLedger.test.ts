/**
 * Ledger custody — the second custody mode, behind the same daemon and
 * socket. A real device is not on this host: the transport is a mock that
 * speaks the Ethereum app's APDUs (GET_ETH_PUBLIC_ADDRESS, SIGN_TX in
 * 255-byte chunks, SIGN_EIP712_HASHED) and signs with a known key, so what
 * the custody returns can be compared byte for byte with the raw key's
 * signature. What a real device adds — the HID transport, the on-screen
 * confirmation, the app's own v encoding and chunking quirks — is not
 * exercised here.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
    keccak256, hexToBytes, toHex, concat, domainSeparator, hashStruct, serializeTransaction,
    parseTransaction, recoverTransactionAddress,
    type Hex, type TransactionSerializable,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";

import {
    ledgerCustody, encodeBip32Path, createSignerDaemon, signerHealth, socketSignerAccount,
    validatePolicy, APPROVE_SELECTOR, type LedgerTransport,
} from "../src/signer/index.js";
import { buildCommitment, buildDomain } from "../src/index.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const WALLET = privateKeyToAccount(KEY).address;
const OTHER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;
const CORE = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;
const PATH = "m/44'/60'/0'/0/0";

/** A device that speaks the Ethereum app's APDUs over `exchange`. */
function mockLedger(opts: { key?: Hex; signWith?: Hex; status?: number } = {}) {
    const key = opts.key ?? KEY;
    const seen: Uint8Array[] = [];
    let txPayload: Uint8Array | null = null;
    const ok = (body: Uint8Array | Hex) => concat([typeof body === "string" ? body : toHex(body), "0x9000"]);
    const sw = (code: number) => new Uint8Array([code >> 8, code & 0xff]);
    const vrs = async (hash: Hex, vBase: number) => {
        const s = await sign({ hash, privateKey: opts.signWith ?? key });
        const yParity = s.yParity ?? (Number(s.v) - 27);
        return concat([toHex(vBase + yParity, { size: 1 }), s.r, s.s]);
    };
    const transport: LedgerTransport = {
        async exchange(apdu) {
            seen.push(apdu);
            if (opts.status) return sw(opts.status);
            const [cla, ins, p1] = apdu;
            const data = apdu.slice(5, 5 + apdu[4]);
            expect(cla).toBe(0xe0);
            const pathLen = 1 + 4 * data[0];
            if (ins === 0x02) {
                const pub = secp256k1.getPublicKey(hexToBytes(key), false);
                const addr = new TextEncoder().encode(privateKeyToAccount(key).address.slice(2));
                return hexToBytes(ok(concat([toHex(pub.length, { size: 1 }), toHex(pub), toHex(addr.length, { size: 1 }), toHex(addr)])));
            }
            if (ins === 0x04) {
                txPayload = p1 === 0x00 ? data.slice(pathLen) : new Uint8Array([...(txPayload ?? []), ...data]);
                // The app answers each chunk; the last one carries the
                // signature. The mock signs on every chunk; the custody reads
                // the reply to the last.
                return hexToBytes(ok(hexToBytes(await vrs(keccak256(txPayload), 0))));
            }
            if (ins === 0x0c) {
                const body = data.slice(pathLen);
                const hash = keccak256(concat(["0x1901", toHex(body.slice(0, 32)), toHex(body.slice(32, 64))]));
                return hexToBytes(ok(hexToBytes(await vrs(hash, 27))));
            }
            return sw(0x6d00);
        },
    };
    return { transport, seen };
}

function typedCommitment() {
    const domain = buildDomain(11155111, CORE);
    return buildCommitment({
        processId: ("0x" + "00".repeat(32)) as Hex,
        buyer: WALLET, seller: privateKeyToAccount(OTHER_KEY).address, currency: TOKEN,
        payment: 500_000n, expectedCumulativeValue: 500_000n,
        checkoutHash: ("0x" + "11".repeat(32)) as Hex,
        salt: 7n, deadline: 9_999_999_999n,
    }, domain).typedData;
}

describe("ledger custody", () => {
    it("encodes a BIP-32 path as the app reads it, hardened components marked", () => {
        expect(toHex(encodeBip32Path(PATH))).toBe("0x058000002c8000003c800000000000000000000000");
        expect(() => encodeBip32Path("44'/60'")).toThrow(/m\//);
        expect(() => encodeBip32Path("m/x")).toThrow(/component/);
    });

    it("reads the device's address and checks it against the device's own public key", async () => {
        const custody = await ledgerCustody({ transport: mockLedger().transport, path: PATH });
        expect(custody.address).toBe(WALLET);
    });

    it("signs typed data byte for byte as the raw key does, over the domain and struct hashes", async () => {
        const { transport, seen } = mockLedger();
        const custody = await ledgerCustody({ transport, path: PATH });
        const typedData = typedCommitment();
        const viaLedger = await custody.signTypedData(typedData);
        expect(viaLedger).toBe(await privateKeyToAccount(KEY).signTypedData(typedData));
        const apdu = seen.at(-1)!;
        expect(apdu[1]).toBe(0x0c);
        const body = toHex(apdu.slice(5 + 21));
        expect(body).toBe(concat([
            domainSeparator({ domain: typedData.domain }),
            hashStruct({ data: typedData.message as never, primaryType: typedData.primaryType, types: typedData.types as never }),
        ]));
    });

    it("signs an EIP-1559 transaction byte for byte as the raw key does, chunked at 255 bytes", async () => {
        const { transport, seen } = mockLedger();
        const custody = await ledgerCustody({ transport, path: PATH });
        const tx: TransactionSerializable = {
            to: CORE, data: (APPROVE_SELECTOR + "ab".repeat(300)) as Hex, value: 0n,
            gas: 100_000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n, nonce: 3, chainId: 11155111, type: "eip1559",
        };
        expect(await custody.signTransaction(tx)).toBe(await privateKeyToAccount(KEY).signTransaction(tx));
        const signs = seen.filter((a) => a[1] === 0x04);
        expect(signs.length).toBeGreaterThan(1);
        expect(signs[0][2]).toBe(0x00);
        for (const a of signs.slice(1)) expect(a[2]).toBe(0x80);
        for (const a of signs) expect(a[4]).toBeLessThanOrEqual(255);
        const sent = concat(signs.map((a, i) => toHex(a.slice(5 + (i === 0 ? 21 : 0)))));
        expect(sent).toBe(serializeTransaction(tx));
    });

    it("signs a legacy EIP-155 transaction as the raw key does", async () => {
        const custody = await ledgerCustody({ transport: mockLedger().transport, path: PATH });
        const tx: TransactionSerializable = {
            to: CORE, data: "0xaaaaaaaa", value: 0n, gas: 50_000n, gasPrice: 7n, nonce: 1, chainId: 11155111, type: "legacy",
        };
        expect(await custody.signTransaction(tx)).toBe(await privateKeyToAccount(KEY).signTransaction(tx));
    });

    it("signs a transaction whose type is inferred (gasPrice + accessList, no type) as the raw key does, both parities", async () => {
        const custody = await ledgerCustody({ transport: mockLedger().transport, path: PATH });
        const parities = new Set<number>();
        for (let nonce = 0; nonce < 12; nonce++) {
            const tx: TransactionSerializable = {
                to: CORE, data: "0xaaaaaaaa", value: 0n, gas: 50_000n, gasPrice: 7n, accessList: [], nonce, chainId: 11155111,
            };
            const viaLedger = await custody.signTransaction(tx);
            expect(viaLedger.slice(0, 4)).toBe("0x01");
            expect(viaLedger).toBe(await privateKeyToAccount(KEY).signTransaction(tx));
            expect(await recoverTransactionAddress({ serializedTransaction: viaLedger as never })).toBe(WALLET);
            parities.add(parseTransaction(viaLedger).yParity!);
        }
        expect(parities).toEqual(new Set([0, 1]));
    });

    it("refuses a signature that does not recover to the device's address", async () => {
        const custody = await ledgerCustody({ transport: mockLedger({ signWith: OTHER_KEY }).transport, path: PATH });
        await expect(custody.signTypedData(typedCommitment())).rejects.toThrow(/does not recover/);
    });

    it("names the device's refusal by its status word", async () => {
        await expect(ledgerCustody({ transport: mockLedger({ status: 0x6985 }).transport, path: PATH }))
            .rejects.toThrow(/0x6985.*refused on the device/);
    });

    it("runs behind the same daemon and socket the keystore custody does", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-ledger-"));
        const socketPath = path.join(dir, "signer.sock");
        const r = validatePolicy({
            chainId: 11155111, verifyingContracts: [CORE], contracts: { [CORE]: ["0xaaaaaaaa"] }, token: TOKEN,
            ceilings: { perAction: "2000000", perPeriod: "5000000", periodSecs: 86400 },
            egress: [], rpcUrl: "https://rpc.example",
        });
        if (!r.ok) throw new Error(r.errors.join("; "));
        const custody = await ledgerCustody({ transport: mockLedger().transport, path: PATH });
        const daemon = createSignerDaemon({
            policy: r.policy, custody, socketPath,
            auditPath: path.join(dir, "audit.jsonl"), journalPath: path.join(dir, "window.jsonl"),
            simulate: async () => ({ reverted: false }),
        });
        await daemon.listen();
        try {
            expect((await signerHealth({ socketPath })).address).toBe(WALLET);
            const account = socketSignerAccount({ socketPath, address: WALLET });
            const typedData = typedCommitment();
            expect(await account.signTypedData(typedData)).toBe(await privateKeyToAccount(KEY).signTypedData(typedData));
        } finally {
            await daemon.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("takes one custody, never both or neither", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-ledger-one-"));
        const r = validatePolicy({
            chainId: 1, verifyingContracts: [CORE], contracts: { [CORE]: ["0xaaaaaaaa"] }, token: TOKEN,
            ceilings: { perAction: "1", perPeriod: "1", periodSecs: 1 }, egress: [], rpcUrl: "https://rpc.example",
        });
        if (!r.ok) throw new Error("policy");
        const files = { socketPath: path.join(dir, "s.sock"), auditPath: path.join(dir, "a.jsonl"), journalPath: path.join(dir, "w.jsonl") };
        expect(() => createSignerDaemon({ policy: r.policy, ...files })).toThrow(/one custody/);
        expect(() => createSignerDaemon({
            policy: r.policy, ...files, privateKey: KEY,
            custody: { address: WALLET, signTypedData: async () => "0x", signTransaction: async () => "0x" },
        })).toThrow(/one custody/);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
