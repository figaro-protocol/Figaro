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

    const [channel, setChannel] = useState<HandoffChannel | null>(null);
    const [peerPubKey, setPeerPubKey] = useState<string | null>(null);
    const [blob, setBlob] = useState<string | null>(null);
    const [requested, setRequested] = useState(false);
    const [received, setReceived] = useState<T | null>(null);
    const [anchored, setAnchored] = useState<AnchorVerificationState>("unknown");

    // The channel + subscriptions, under the verify-and-skip contract
    // documented above.
    useEffect(() => {
        if (!address || !enabled) return;
        let disposed = false;
        const unsubs: Array<() => void> = [];
        const acceptFromCounterparty = async (msg: AuthenticatedEcdhMessage): Promise<boolean> => {
            if (!hexEqual(msg.senderAddress, counterparty)) return false;
            return verifyEcdhMessageAuth(msg);
        };
        void getHandoffChannel(address).then((ch) => {
            if (disposed) return;
            setChannel(ch);
            unsubs.push(ch.onEcdhPubkey(ceremonyId, (msg) => {
                void acceptFromCounterparty(msg).then((ok) => {
                    if (ok && !disposed) setPeerPubKey(msg.pubKeyHex);
                });
            }));
            unsubs.push(ch.onWrappedKey(ceremonyId, (msg) => {
                void acceptFromCounterparty(msg).then((ok) => {
                    if (ok && !disposed) setBlob(msg.wrappedKeyB64);
                });
            }));
        });
        // A keypair in sessionStorage marks a request already sent this session.
        setRequested(getOrderEcdhKeypair(address, ceremonyId) !== null);
        return () => {
            disposed = true;
            for (const u of unsubs) u();
        };
    }, [address, enabled, ceremonyId, counterparty]);

    // Decrypt once both halves arrived, then poll the expected fingerprint
    // against the on-chain anchor until it lands.
    useEffect(() => {
        if (!enabled || !address || !peerPubKey || !blob) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        void (async () => {
            const decrypted = await decrypt({
                myAddress: address, senderPubKeyHex: peerPubKey, blobB64: blob,
            });
            if (cancelled) return;
            setReceived(decrypted);
            if (!decrypted) return;
            const expected = expectedAnchor(decrypted, blob);
            if (!expected) return;
            const checkAnchor = async () => {
                if (!publicClient || cancelled) return;
                const verified = await attestationAnchorMatches(publicClient, chainId, orderHash, expected);
                if (cancelled) return;
                setAnchored(verified ? "verified" : "missing");
                if (!verified) timer = setTimeout(() => void checkAnchor(), 3000);
            };
            await checkAnchor();
        })();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, address, peerPubKey, blob, orderHash, publicClient, chainId, decrypt, expectedAnchor]);

    return { channel, peerPubKey, requested, setRequested, received, anchored };
}
