"use client";

/**
 * lib/handoff/useCeremonyChannel.ts
 *
 * The shared half of an ECDH handoff-ceremony panel (AddressDetailPanel,
 * ContentDeliveryPanel): the coordination-channel subscription with the
 * verify-and-skip authentication contract, the requested-this-session
 * bookkeeping, and the decrypt-then-verify-anchor pipeline. The panels
 * keep their codec — what a ceremony payload IS, and how its on-chain
 * anchor is derived — and their JSX.
 *
 * Channel subscription (the message-authentication path): both parties
 * send ECDH pubkeys on the same ceremony id. Transport identity is
 * UNTRUSTED — every message must (1) carry a wallet signature that
 * verifies against its claimed sender and (2) claim exactly this order's
 * counterparty. Failures are SKIPPED, never terminal: the listener keeps
 * listening, so an injected message can neither impersonate the
 * counterparty nor end the ceremony. (The counterparty check also drops
 * our own messages.)
 *
 * Anchor verification: once both halves arrived, decrypt, then poll the
 * decrypted payload's expected fingerprint against the order's on-chain
 * attestations — the anchor tx can confirm AFTER the channel messages
 * arrive, so the check re-runs until it lands (the event cache makes
 * re-reads cheap). Symmetric: either side receives this way.
 *
 * `decrypt` and `expectedAnchor` are effect dependencies — callers MUST
 * memoize them (useCallback) or the ceremony re-decrypts every render.
 */

import { useEffect, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { getHandoffChannel } from "@/lib/handoff/channel";
import {
    verifyEcdhMessageAuth,
    type AuthenticatedEcdhMessage,
    type HandoffChannel,
} from "@figaro-protocol/sdk/handoff";
import { getOrderEcdhKeypair } from "@/lib/handoff/ecdh";
import {
    attestationAnchorMatches,
    type AnchorVerificationState,
} from "@/lib/handoff/handoffAnchorState";
import { hexEqual } from "@/lib/shared/evm";

export interface UseCeremonyChannelOptions<T> {
    /** The connected wallet; the ceremony idles while undefined. */
    address: `0x${string}` | undefined;
    /** False while the wallet is no party to this order — everything idles. */
    enabled: boolean;
    /**
     * The channel topic both parties publish on — the order hash itself
     * (address ceremony) or an id derived from it (content ceremony).
     */
    ceremonyId: string;
    /** The order whose attestations anchor this ceremony's payload. */
    orderHash: string;
    /** The ONE wallet whose signed messages are accepted. */
    counterparty: string;
    /** Decrypt the counterparty's blob; null = undecryptable. Memoize. */
    decrypt: (args: {
        myAddress: `0x${string}`;
        senderPubKeyHex: string;
        blobB64: string;
    }) => Promise<T | null>;
    /**
     * The on-chain fingerprint expected for a decrypted payload; null
     * skips anchor verification (e.g. the declaring clause's spec isn't
     * loaded). Memoize.
     */
    expectedAnchor: (decrypted: T, blobB64: string) => `0x${string}` | null;
}

export interface UseCeremonyChannelResult<T> {
    /** The coordination channel (mock in e2e, XMTP live); null until ready. */
    channel: HandoffChannel | null;
    /** The counterparty's authenticated ephemeral pubkey, once received. */
    peerPubKey: string | null;
    /** True once this session has sent a request (keypair in sessionStorage). */
    requested: boolean;
    setRequested: (requested: boolean) => void;
    /** The counterparty's decrypted payload, once both halves arrived. */
    received: T | null;
    /** The on-chain anchor verdict for `received`. */
    anchored: AnchorVerificationState;
}

export function useCeremonyChannel<T>(
    options: UseCeremonyChannelOptions<T>,
): UseCeremonyChannelResult<T> {
    const { address, enabled, ceremonyId, orderHash, counterparty, decrypt, expectedAnchor } = options;
    const chainId = useChainId();
    const publicClient = usePublicClient();

    // Every received or verified value is tagged with the ceremony it belongs
    // to — wallet, ceremony id, counterparty, order. A change of any is a new
    // ceremony: a value tagged with another one reads as absent, so nothing
    // received, decrypted or verified carries over (and an in-flight answer
    // for the old ceremony lands under its own tag, never the new one).
    const ceremonyKey = `${address?.toLowerCase() ?? ""}|${ceremonyId}|${counterparty.toLowerCase()}|${orderHash.toLowerCase()}`;
    type Tagged<V> = { key: string; value: V } | null;
    const current = <V,>(tagged: Tagged<V>, absent: V): V => (tagged && tagged.key === ceremonyKey ? tagged.value : absent);

    const [channelTagged, setChannel] = useState<Tagged<HandoffChannel>>(null);
    const [peerTagged, setPeerPubKey] = useState<Tagged<string>>(null);
    const [blobTagged, setBlob] = useState<Tagged<string>>(null);
    const [requested, setRequested] = useState(false);
    const [receivedTagged, setReceived] = useState<Tagged<T | null>>(null);
    const [anchoredTagged, setAnchored] = useState<Tagged<AnchorVerificationState>>(null);
    const channel = current(channelTagged, null);
    const peerPubKey = current(peerTagged, null);
    const blob = current(blobTagged, null);
    const received = current(receivedTagged, null);
    const anchored = current<AnchorVerificationState>(anchoredTagged, "unknown");

    // The channel + subscriptions, under the verify-and-skip contract
    // documented above.
    useEffect(() => {
        if (!address || !enabled) return;
        const key = ceremonyKey;
        let disposed = false;
        const unsubs: Array<() => void> = [];
        const acceptFromCounterparty = async (msg: AuthenticatedEcdhMessage): Promise<boolean> => {
            if (!hexEqual(msg.senderAddress, counterparty)) return false;
            return verifyEcdhMessageAuth(msg);
        };
        void getHandoffChannel(address).then((ch) => {
            if (disposed) return;
            setChannel({ key, value: ch });
            unsubs.push(ch.onEcdhPubkey(ceremonyId, (msg) => {
                void acceptFromCounterparty(msg).then((ok) => {
                    if (ok && !disposed) setPeerPubKey({ key, value: msg.pubKeyHex });
                });
            }));
            unsubs.push(ch.onWrappedKey(ceremonyId, (msg) => {
                void acceptFromCounterparty(msg).then((ok) => {
                    if (ok && !disposed) setBlob({ key, value: msg.wrappedKeyB64 });
                });
            }));
        });
        // A keypair in sessionStorage marks a request already sent this session.
        setRequested(getOrderEcdhKeypair(address, ceremonyId) !== null);
        return () => {
            disposed = true;
            for (const u of unsubs) u();
        };
    }, [address, enabled, ceremonyId, counterparty, ceremonyKey]);

    // Decrypt once both halves arrived, then poll the expected fingerprint
    // against the on-chain anchor until it lands.
    useEffect(() => {
        if (!enabled || !address || !peerPubKey || !blob) return;
        const key = ceremonyKey;
        let canceled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        void (async () => {
            const decrypted = await decrypt({
                myAddress: address, senderPubKeyHex: peerPubKey, blobB64: blob,
            });
            if (canceled) return;
            setReceived({ key, value: decrypted });
            if (!decrypted) return;
            const expected = expectedAnchor(decrypted, blob);
            if (!expected) return;
            const checkAnchor = async () => {
                if (!publicClient || canceled) return;
                const verified = await attestationAnchorMatches(publicClient, chainId, orderHash, expected);
                if (canceled) return;
                setAnchored({ key, value: verified ? "verified" : "missing" });
                if (!verified) timer = setTimeout(() => void checkAnchor(), 3000);
            };
            await checkAnchor();
        })();
        return () => {
            canceled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, address, peerPubKey, blob, orderHash, publicClient, chainId, decrypt, expectedAnchor, ceremonyKey]);

    return { channel, peerPubKey, requested, setRequested, received, anchored };
}
