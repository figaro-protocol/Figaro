/**
 * Handoff-channel factory — which transport a wallet's `HandoffChannel`
 * (the wire protocol in `@figaro-protocol/sdk/handoff`) actually runs over.
 *
 * Three implementations, chosen by DERIVED facts, never a setting (the
 * one-seam ruling, 2026-08-14):
 *   - Real: XMTP DM via @xmtp/browser-sdk — engaged iff the wallet already
 *     has an XMTP inbox (`walletHasXmtpInbox`, a signature-free probe)
 *   - Null: inert links-only floor (no signer, or no inbox)
 *   - Mock: in-memory message bus for e2e tests
 */

import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";

/** Cached channel instances keyed by address. */
const channelCache = new Map<string, HandoffChannel>();

/** In-flight channel creations keyed by address — the single-flight gate.
 *  Multiple subscribers (the header badge + both /orders subscriptions) can
 *  request the channel on the SAME render pass; without this, each await gap
 *  before `channelCache.set` admits another creation. For XMTP that is not
 *  just waste: two concurrent `Client.create` calls fight over the same
 *  exclusive OPFS sync access handle ("Access Handles cannot be created…",
 *  relay smoke 2026-07-23) and can mint spurious installations. A failed
 *  flight is removed so the next caller (e.g. one that now HAS the wallet
 *  signer) retries cleanly. */
const pendingChannel = new Map<string, Promise<HandoffChannel>>();

/** Join the in-flight creation for `key`, or start one. The resolved channel
 *  lands in `channelCache`; rejection propagates to every joiner and clears
 *  the flight. */
function sharedCreate(key: string, create: () => Promise<HandoffChannel>): Promise<HandoffChannel> {
    const pending = pendingChannel.get(key);
    if (pending) return pending;
    const creating = create().then((ch) => {
        channelCache.set(key, ch);
        return ch;
    });
    pendingChannel.set(key, creating);
    void creating.catch(() => {}).finally(() => pendingChannel.delete(key));
    return creating;
}

/**
 * Get or create a HandoffChannel for the given wallet.
 *
 * In test mode (e2e mock or devnet) returns the mock channel so we
 * never hit the XMTP network in automated tests.
 *
 * @param address  Wallet address (checksummed or lowercase).
 * @param signMessage  Wallet signing capability for XMTP auth.
 */
export async function getHandoffChannel(
    address: string,
    signMessage?: (message: string) => Promise<`0x${string}`>,
): Promise<HandoffChannel> {
    const key = address.toLowerCase();
    const cached = channelCache.get(key);
    if (cached) return cached;

    // In any e2e mode fall back to the mock channel. Uses the shared,
    // sessionStorage-backed detector so the mode survives param-dropping
    // <Link> navigations (e.g. browse → /checkout), not just the entry URL.
    if (isE2EMockSession() || isE2EDevnetSession()) {
        return sharedCreate(key, async () => {
            const { createMockChannel } = await import("./mockChannel");
            return createMockChannel(address);
        });
    }

    // Outside test mode the transport is DERIVED, never a setting (the
    // one-seam ruling, 2026-08-14 — the per-wallet toggle is deleted): a
    // wallet that already has an XMTP inbox chose XMTP somewhere, so its
    // channel connects there (continuation, not seizure — the signature on
    // first connect re-establishes the wallet's own chosen channel on this
    // device); a wallet with no inbox — or no signer to connect one — stays
    // on the links-only floor (the share/receive URI flow: no push
    // transport, no broker, always works). In-app inbox CREATION is a
    // deliberate future flow, an action rather than a setting.
    if (!signMessage) {
        return sharedCreate(key, async () => {
            const { createNullChannel } = await import("./nullChannel");
            return createNullChannel();
        });
    }
    // ONE flight covers probe + creation: the derived-transport probe is an
    // async gap, and a probe outside the gate would let two concurrent
    // callers each start an XMTP creation — the exact OPFS double-flight the
    // gate exists to prevent (caught by the single-flight suite, 2026-08-14).
    // The xmtpChannel import is lazy — webpack emits it as its own chunk; the
    // module itself lazy-imports @xmtp/browser-sdk, keeping WASM out of the
    // server bundle.
    return sharedCreate(key, async () => {
        const { walletHasXmtpInbox, createXmtpChannel } = await import("@/lib/handoff/xmtpChannel");
        if (!(await walletHasXmtpInbox(address))) {
            const { createNullChannel } = await import("./nullChannel");
            return createNullChannel();
        }
        return createXmtpChannel(address, signMessage);
    });
}

/** Remove a cached channel (e.g. on wallet disconnect). */
function destroyCoordinationChannel(address: string): void {
    const key = address.toLowerCase();
    const ch = channelCache.get(key);
    if (ch) {
        ch.destroy();
        channelCache.delete(key);
    }
}
