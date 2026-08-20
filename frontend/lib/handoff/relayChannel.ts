/**
 * relayChannel — the handoff relay's PRE-COMMIT cell speaking the
 * `CoordinationChannel` interface (the one-seam ruling, 2026-08-14).
 *
 * The dispatch race races over `CoordinationChannel`, period: agent
 * candidates answer over HTTP/A2A, wallet candidates answer over THIS
 * adapter — publish the draft on the relay keyed by the commitment's order
 * hash, await the counterparty's reply on the same key. The adapter covers
 * ONLY the pre-commit offer exchange; everything else the handoff family
 * carries (ECDH ceremonies, address detail, post-commit delivery) is its own
 * and never enters a race.
 *
 * `sendOffer` resolves with the counterparty's first WELL-FORMED reply
 * (deserializable, size-capped, carrying a seller signature — transport-level
 * shape filtering; cryptographic verification is the race engine's, one
 * path). It resolves `null` only at `close()` — the caller's race window,
 * not this adapter, decides when waiting ends.
 */
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    MAX_COMMITMENT_PAYLOAD_BYTES,
    type CommitmentPayload,
    type CoordinationChannel,
} from "@figaro-protocol/sdk/agent";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import type { HandoffMessagingService, WalletMessageSigner } from "./handoffMessagingService";

/** The two relay capabilities the pre-commit cell uses — structural, so the
 *  adapter names no concrete transport. */
type CommitmentPayloadWire = Pick<
    HandoffMessagingService,
    "sendCommitmentPayload" | "subscribeCommitmentPayload"
>;

/**
 * Relay one commitment payload to a counterparty, keyed by the commitment's
 * order hash — the ONE relay-send mechanic (race drafts out, countersigned
 * replies back, the fully-signed last mile). Delivered INLINE over the
 * E2E-encrypted channel (audit F Arm 2), never a public IPFS pin.
 *
 * A QUOTE answers under the REQUEST's id (`threadOrderId`): a counter-draft
 * is a different struct by construction (the candidate re-priced it), and the
 * buyer listens on the id of the draft they sent.
 */
export async function relayCommitmentPayload(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    handoffMessaging: Pick<HandoffMessagingService, "sendCommitmentPayload">;
    threadOrderId?: string;
}): Promise<string> {
    const orderId = params.threadOrderId ?? commitmentOrderHash(params.payload.commitment, params.chainId);
    const serialized = serializeCommitmentPayload(params.payload);
    if (new TextEncoder().encode(serialized).length > MAX_COMMITMENT_PAYLOAD_BYTES) {
        throw new Error("Payload too large to relay over the coordination channel.");
    }
    await params.handoffMessaging.sendCommitmentPayload({
        address: params.senderAddress,
        walletClient: params.walletClient,
        recipientAddress: params.recipientAddress,
        orderId,
        payload: serialized,
    });
    return orderId;
}

export interface RelayChannelDeps {
    handoffMessaging: CommitmentPayloadWire;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
}

/** A `CoordinationChannel` whose lifetime the caller owns: `close()` releases
 *  every relay subscription and resolves still-waiting `sendOffer`s null. */
export interface RelayCoordinationChannel extends CoordinationChannel {
    close(): void;
}

export function createRelayCoordinationChannel(deps: RelayChannelDeps): RelayCoordinationChannel {
    const unsubs: Array<() => void> = [];
    const settles: Array<(p: CommitmentPayload | null) => void> = [];
    let closed = false;

    return {
        async sendOffer(seller, draft) {
            if (closed) return null;
            const orderId = commitmentOrderHash(draft.commitment, deps.chainId);
            return new Promise<CommitmentPayload | null>((resolve) => {
                let settled = false;
                const settle = (p: CommitmentPayload | null) => {
                    if (settled) return;
                    settled = true;
                    resolve(p);
                };
                settles.push(settle);
                void (async () => {
                    try {
                        // Subscribe FIRST, relay second — a fast counterparty
                        // must not reply into the void.
                        const unsub = await deps.handoffMessaging.subscribeCommitmentPayload({
                            address: deps.senderAddress,
                            walletClient: deps.walletClient ?? null,
                            orderId,
                            callback: (payloadJson: string) => {
                                try {
                                    if (new TextEncoder().encode(payloadJson).length > MAX_COMMITMENT_PAYLOAD_BYTES) return;
                                    const payload = deserializeCommitmentPayload(payloadJson);
                                    // The buyer's own relayed draft can echo on
                                    // the same key — a reply carries a seller
                                    // signature; keep listening otherwise.
                                    if (!payload.sellerSig) return;
                                    settle(payload);
                                } catch {
                                    // Malformed — ignore; the window closes the race.
                                }
                            },
                        });
                        unsubs.push(unsub);
                        await relayCommitmentPayload({
                            payload: draft,
                            recipientAddress: seller,
                            senderAddress: deps.senderAddress,
                            walletClient: deps.walletClient,
                            chainId: deps.chainId,
                            handoffMessaging: deps.handoffMessaging,
                        });
                    } catch {
                        settle(null);
                    }
                })();
            });
        },
        close() {
            closed = true;
            for (const unsub of unsubs.splice(0)) unsub();
            for (const settle of settles.splice(0)) settle(null);
        },
    };
}
