/**
 * Message-layer authentication for the ECDH ceremony messages.
 *
 * The transport is UNTRUSTED — an XMTP inbox id, a localStorage bus, a
 * shared link: none of them proves who sent a message, and the ceremony's
 * confidentiality is only as good as knowing whom it is confidential TO.
 * So identity rides in the message itself: the sender's wallet signs the
 * canonical auth text binding (type ‖ orderId ‖ body) and the receiver
 * verifies the signature recovers to the claimed `senderAddress`, then
 * checks that address against the order's known counterparty from chain
 * state. A message that fails either check is SKIPPED — listeners keep
 * listening; garbage cannot win a race or end the ceremony.
 */
import { verifyMessage } from "viem";
import type { EcdhPubkeyMessage, EcdhWrappedKeyMessage } from "./messages.js";

/** The two ECDH ceremony messages carry wallet authentication. */
export type AuthenticatedEcdhMessage = EcdhPubkeyMessage | EcdhWrappedKeyMessage;

/** The signature-bearing body of an ECDH message: the ephemeral public key
 *  for the offer, the encrypted blob for the answer. */
function ecdhAuthBody(msg: AuthenticatedEcdhMessage): string {
    return msg.type === "ECDH_PUBKEY" ? msg.pubKeyHex : msg.wrappedKeyB64;
}

/** Canonical EIP-191 text the sender's wallet signs — human-readable, so a
 *  signing prompt shows exactly what is being bound. */
export function ecdhAuthText(
    type: AuthenticatedEcdhMessage["type"],
    orderId: string,
    body: string,
): string {
    return `Figaro handoff auth v1\ntype: ${type}\norder: ${orderId}\nbody: ${body}`;
}

/** Verify an ECDH message's wallet authentication: the signature must
 *  recover to the message's claimed `senderAddress`. Returns false on any
 *  malformed input — verification failure is a skip, never a throw. The
 *  caller still owns the second check: `senderAddress` must equal the
 *  order's counterparty. */
export async function verifyEcdhMessageAuth(msg: AuthenticatedEcdhMessage): Promise<boolean> {
    try {
        return await verifyMessage({
            address: msg.senderAddress as `0x${string}`,
            message: ecdhAuthText(msg.type, msg.orderId, ecdhAuthBody(msg)),
            signature: msg.sig as `0x${string}`,
        });
    } catch {
        return false;
    }
}
