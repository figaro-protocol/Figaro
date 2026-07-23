/**
 * Handoff-channel factory — which transport a wallet's `HandoffChannel`
 * (the wire protocol in `@figaro/sdk/handoff`) actually runs over.
 *
 * Three implementations:
 *   - Real: XMTP DM via @xmtp/browser-sdk (opt-in on /settings)
 *   - Null: inert links-only floor (the default outside test mode)
 *   - Mock: in-memory message bus for e2e tests
 */

import type { HandoffChannel } from "@figaro/sdk/handoff";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";
import { readUserTransport } from "@/lib/shared/userTransport";

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
export async function getCoordinationChannel(
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

    // Outside test mode the transport is the WALLET'S choice, defaulting to
    // `links-only` (the share/receive URI flow — no push transport, no
    // broker). Return an inert channel so callers keep working and the XMTP
    // chunk is NEVER loaded or initialized unless the wallet opted in on
    // /settings. (Applies on reload — the channel is a cached singleton.)
    if (readUserTransport() !== "xmtp") {
        return sharedCreate(key, async () => {
            const { createNullChannel } = await import("./nullChannel");
            return createNullChannel();
        });
    }

    if (!signMessage) {
        throw new Error("signMessage callback required for XMTP channel outside test mode");
    }

    // A normal lazy import — webpack emits ./xmtpChannel as its own chunk.
    // (It carried `webpackIgnore: true` from the V5 baseline, which told
    // webpack to emit NO chunk and left the browser resolving a raw
    // relative URL against /_next/static/chunks/… — a guaranteed 404, so
    // the real XMTP path never worked in any bundled build. The module
    // itself already lazy-imports @xmtp/browser-sdk to keep WASM out of
    // the server bundle; no pragma is needed for that.)
    return sharedCreate(key, async () => {
        const { createXmtpChannel } = await import("./xmtpChannel");
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
