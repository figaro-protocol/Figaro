/**
 * @figaro/sdk/signer — encrypted keystore custody (first custody mode).
 *
 * Web3 Secret Storage (V3) decrypt using node:crypto only — scrypt or
 * pbkdf2-sha256 KDF, aes-128-ctr cipher, keccak256 MAC. The key exists
 * only in the signer process's memory after this returns; nothing here
 * ever writes or logs key material.
 */

import { createDecipheriv, pbkdf2Sync, scryptSync, timingSafeEqual } from "node:crypto";
import { keccak256, type Hex } from "viem";

interface KeystoreCrypto {
    cipher: string;
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: string;
    kdfparams: Record<string, unknown>;
    mac: string;
}

export interface KeystoreV3 {
    version: number;
    address?: string;
    crypto?: KeystoreCrypto;
    Crypto?: KeystoreCrypto;
}

function deriveKey(kdf: string, params: Record<string, unknown>, passphrase: string): Buffer {
    const salt = Buffer.from(String(params.salt), "hex");
    const dklen = Number(params.dklen);
    if (!Number.isInteger(dklen) || dklen < 32) {
        throw new Error("keystore: dklen must be an integer >= 32");
    }
    if (kdf === "scrypt") {
        const N = Number(params.n);
        const r = Number(params.r);
        const p = Number(params.p);
        return scryptSync(passphrase, salt, dklen, {
            N, r, p,
            // node caps scrypt memory at 32 MiB by default; geth's standard
            // N=262144/r=8 needs 256 MiB — size the cap to the parameters.
            maxmem: 256 * N * r,
        });
    }
    if (kdf === "pbkdf2") {
        if (params.prf !== "hmac-sha256") {
            throw new Error(`keystore: unsupported prf ${String(params.prf)}`);
        }
        return pbkdf2Sync(passphrase, salt, Number(params.c), dklen, "sha256");
    }
    throw new Error(`keystore: unsupported kdf ${kdf}`);
}

/**
 * Decrypt a V3 keystore JSON into a 0x-prefixed private key. Throws on a
 * wrong passphrase (MAC mismatch), an unsupported cipher/KDF, or an address
 * field that does not match the decrypted key's expectation — the caller
 * (the daemon) treats any throw as refuse-to-start.
 */
export function decryptKeystore(keystore: KeystoreV3, passphrase: string): Hex {
    if (keystore.version !== 3) {
        throw new Error(`keystore: unsupported version ${keystore.version}`);
    }
    const c = keystore.crypto ?? keystore.Crypto;
    if (!c) throw new Error("keystore: missing crypto section");
    if (c.cipher !== "aes-128-ctr") {
        throw new Error(`keystore: unsupported cipher ${c.cipher}`);
    }

    const dk = deriveKey(c.kdf, c.kdfparams, passphrase);
    const ciphertext = Buffer.from(c.ciphertext, "hex");

    const mac = keccak256(Buffer.concat([dk.subarray(16, 32), ciphertext]));
    const expected = Buffer.from(c.mac.replace(/^0x/, ""), "hex");
    const actual = Buffer.from(mac.slice(2), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new Error("keystore: MAC mismatch — wrong passphrase or corrupted file");
    }

    const decipher = createDecipheriv(
        "aes-128-ctr",
        dk.subarray(0, 16),
        Buffer.from(c.cipherparams.iv, "hex"),
    );
    const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (key.length !== 32) throw new Error("keystore: decrypted key is not 32 bytes");
    return (`0x${key.toString("hex")}`) as Hex;
}
