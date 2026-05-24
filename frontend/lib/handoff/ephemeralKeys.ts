/**
 * Per-order ephemeral secp256k1 keypair generation.
 *
 * Each handoff order gets its own keypair. The buyer's ephemeral public key
 * is embedded in the v3 manifest (on-chain commitment). The ephemeral private
 * key is stored locally per order so Phase 3 can derive an ECDH shared secret
 * with the assigned fulfiller's wallet.
 */

import { PrivateKey } from "eciesjs";
import { bytesToHex } from "@/lib/shared/evm";

export interface EphemeralKeypair {
    /** Hex-encoded 32-byte private key. */
    privateKeyHex: string;
    /** Hex-encoded compressed (33-byte) public key. */
    publicKeyHex: string;
}

/** Generate a fresh ephemeral secp256k1 keypair for a single order. */
export function generateOrderKeypair(): EphemeralKeypair {
    const sk = new PrivateKey();
    return {
        privateKeyHex: bytesToHex(new Uint8Array(sk.secret)),
        publicKeyHex: sk.publicKey.toHex(),
    };
}
