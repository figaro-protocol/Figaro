/**
 * Inert HandoffChannel for the `links-only` transport (the default).
 *
 * When a wallet has NOT opted into a push transport, coordination happens
 * out-of-band through the share/receive URI flow: the counter-party opens a
 * shared link, no broker relays anything. This channel therefore does
 * nothing — every send is a no-op that resolves, every subscription returns
 * an inert unsubscribe. It exists so the channel factory can honour the
 * `links-only` floor WITHOUT loading or initializing the XMTP chunk, while
 * callers keep the same interface they use for the mock and XMTP channels.
 */
import type { HandoffChannel } from "@figaro/sdk/handoff";

/** Create an inert coordination channel (no push transport). */
export function createNullChannel(): HandoffChannel {
    const noopUnsubscribe = () => {};
    return {
        async sendHandoffKey() {},
        onHandoffKey() { return noopUnsubscribe; },
        async sendEcdhPubkey() {},
        onEcdhPubkey() { return noopUnsubscribe; },
        async sendWrappedKey() {},
        onWrappedKey() { return noopUnsubscribe; },
        async sendCommitmentPayload() {},
        onCommitmentPayload() { return noopUnsubscribe; },
        onAnyCommitmentPayload() { return noopUnsubscribe; },
        destroy() {},
    };
}
