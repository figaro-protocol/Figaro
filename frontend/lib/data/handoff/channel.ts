/**
 * Handoff-channel factory — which transport a wallet's `HandoffChannel`
 * (the wire protocol in `@figaro-protocol/sdk/handoff`) actually runs over.
 *
 * Three implementations, chosen by DERIVED facts, never a setting (the
 * one-seam rule):
 *   - Real: XMTP DM via @xmtp/browser-sdk — engaged iff the wallet already
 *     has an XMTP inbox (`walletHasXmtpInbox`, a signature-free probe)
 *   - Null: inert links-only floor (no signer, or no inbox)
 *   - Mock: in-memory message bus for e2e tests
 *
 * One test setting picks the transport: an e2e build that carries
 * `NEXT_PUBLIC_E2E_HANDOFF_CHANNEL=xmtp` runs its devnet sessions over the
 * real XMTP channel against the broker `NEXT_PUBLIC_XMTP_ENV` names (a local
 * one in CI). `next.config.mjs` refuses the setting in a deploy build.
 */

import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";

/** The e2e build's devnet sessions cross the real XMTP channel, not the mock
 *  bus. Read as a literal so the build inlines it. */
const E2E_OVER_XMTP = process.env.NEXT_PUBLIC_E2E_HANDOFF_CHANNEL === "xmtp";

/** Cached channel instances keyed by address. */
const channelCache = new Map<string, HandoffChannel>();

/** In-flight channel creations keyed by address — the single-flight gate.
 *  Multiple subscribers (the header badge + both /orders subscriptions) can
 *  request the channel on the SAME render pass; without this, each await gap
 *  before `channelCache.set` admits another creation. For XMTP that is not
 *  just waste: two concurrent `Client.create` calls fight over the same
 *  exclusive OPFS sync access handle ("Access Handles cannot be created…",
 *  as the relay smoke shows) and can mint spurious installations. A failed
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
 * never hit the XMTP network in automated tests, unless the e2e build
 * runs its devnet sessions over XMTP (`E2E_OVER_XMTP`).
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
    const devnetOverXmtp = E2E_OVER_XMTP && isE2EDevnetSession();
    if (isE2EMockSession() || (isE2EDevnetSession() && !devnetOverXmtp)) {
        return sharedCreate(key, async () => {
            const { createMockChannel } = await import("./mockChannel");
            return createMockChannel(address);
        });
    }

    // Outside test mode the transport is DERIVED, never a setting (the
    // one-seam rule — there is no per-wallet toggle): a
    // wallet that already has an XMTP inbox chose XMTP somewhere, so its
    // channel connects there (continuation, not seizure — the signature on
    // first connect re-establishes the wallet's own chosen channel on this
    // device); a wallet with no inbox — or no signer to connect one — stays
    // on the links-only floor (the share/receive URI flow: no push
    // transport, no broker, always works). In-app inbox CREATION is a
    // deliberate future flow, an action rather than a setting.
    //
    // The signer-less floor is never cached: wagmi hands the wallet client
    // over after the first render, and a cached floor would answer the
    // caller that comes back WITH the signer, so the wallet would never
    // reach its own XMTP inbox.
    if (!signMessage) {
        const { createNullChannel } = await import("./nullChannel");
        return createNullChannel();
    }
    // ONE flight covers probe + creation: the derived-transport probe is an
    // async gap, and a probe outside the gate would let two concurrent
    // callers each start an XMTP creation — the exact OPFS double-flight the
    // gate exists to prevent (the single-flight suite pins this).
    // The xmtpChannel import is lazy — webpack emits it as its own chunk; the
    // module itself lazy-imports @xmtp/browser-sdk, keeping WASM out of the
    // server bundle.
    return sharedCreate(key, async () => {
        const { walletHasXmtpInbox, createXmtpChannel } = await import("@/lib/data/handoff/xmtpChannel");
        // An e2e run starts on an empty broker, where the probe answers no
        // for every wallet: there the channel registers the inbox itself.
        if (!devnetOverXmtp && !(await walletHasXmtpInbox(address))) {
            const { createNullChannel } = await import("./nullChannel");
            return createNullChannel();
        }
        return createXmtpChannel(address, signMessage);
    });
}
