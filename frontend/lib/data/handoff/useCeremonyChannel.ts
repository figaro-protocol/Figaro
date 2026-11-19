"use client";

/**
 * lib/data/handoff/useCeremonyChannel.ts
 *
 * The shared half of an ECDH handoff-ceremony panel (AddressDetailPanel,
 * ContentDeliveryPanel, PrivateFilingsPanel): the coordination-channel subscription with the
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
 * Anchor verification: once both halves arrived, decrypt, then poll each
 * of the decrypted payload's expectations (a fingerprint, or a whole
 * attestation place) against the order's on-chain attestations — the
 * anchor tx can confirm AFTER the channel messages arrive, so the check
 * re-runs until every expectation lands (the event cache makes re-reads
 * cheap). Symmetric: either side receives this way.
 *
 * `decrypt` and `expectedAnchor` are effect dependencies — callers MUST
 * memoize them (useCallback) or the ceremony re-decrypts every render.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { getHandoffChannel } from "@/lib/data/handoff/channel";
import {
    verifyEcdhMessageAuth,
    type AuthenticatedEcdhMessage,
    type HandoffChannel,
} from "@figaro-protocol/sdk/handoff";
import { getOrderEcdhKeypair } from "@/lib/data/handoff/ecdh";
import {
    attestationAnchorMatches,
    type AnchorExpectation,
    type AnchorVerificationState,
} from "@/lib/data/handoff/handoffAnchorState";
import { hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useAttestationCoordinatorActions } from "@/lib/core/useAttestationCoordinatorActions";
import type { PartyRole } from "@/lib/core/walletProcessQueries";

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
     * What the chain must hold for a decrypted payload: one expectation (a
     * content reference, or a whole attestation place), or one per part of
     * the payload; `sender` is the counterparty whose signed messages
     * carried it. Null or an empty list skips anchor verification (e.g. the
     * declaring clause's spec isn't loaded). Memoize.
     */
    expectedAnchor: (decrypted: T, blobB64: string, sender: string) => AnchorExpectation | readonly AnchorExpectation[] | null;
}

export interface UseCeremonyChannelResult<T> {
    /** The coordination channel (mock in e2e, XMTP live); null until ready. */
    channel: HandoffChannel | null;
    /** The counterparty's authenticated ephemeral pubkey, once received. */
    peerPubKey: string | null;
    /** True once this session has sent a request (keypair in sessionStorage). */
    requested: boolean;
    /** True once this page sent the request. A request found only by its
     *  keypair was sent by an earlier load of this tab, or by the tab this
     *  one was duplicated from (a browser copies session storage into a
     *  duplicated tab): the page may then send it again, with the same key. */
    requestedHere: boolean;
    /** Mark the request sent from this page. */
    markRequested: () => void;
    /** The counterparty's decrypted payload, once both halves arrived. */
    received: T | null;
    /** The on-chain anchor verdict for `received`: verified once every
     *  expectation holds. */
    anchored: AnchorVerificationState;
    /** One verdict per expectation, in the order `expectedAnchor` returned
     *  them; empty until the first check. */
    anchoredEach: readonly boolean[];
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
    const [requestedHere, setRequestedHere] = useState(false);
    const markRequested = useCallback(() => {
        setRequested(true);
        setRequestedHere(true);
    }, []);
    const [receivedTagged, setReceived] = useState<Tagged<T | null>>(null);
    const [anchoredTagged, setAnchored] = useState<Tagged<readonly boolean[]>>(null);
    const channel = current(channelTagged, null);
    const peerPubKey = current(peerTagged, null);
    const blob = current(blobTagged, null);
    const received = current(receivedTagged, null);
    const anchoredEach = current<readonly boolean[]>(anchoredTagged, NO_VERDICTS);
    const anchored: AnchorVerificationState =
        anchoredEach.length === 0 ? "unknown" : anchoredEach.every(Boolean) ? "verified" : "missing";

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
        setRequestedHere(false);
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
            const expected = expectedAnchor(decrypted, blob, counterparty);
            const expectations: readonly AnchorExpectation[] =
                expected === null ? [] : Array.isArray(expected) ? expected : [expected as AnchorExpectation];
            if (expectations.length === 0) return;
            const checkAnchor = async () => {
                if (!publicClient || canceled) return;
                const each = await Promise.all(
                    expectations.map((e) => attestationAnchorMatches(publicClient, chainId, orderHash, e)),
                );
                if (canceled) return;
                setAnchored({ key, value: each });
                if (!each.every(Boolean)) timer = setTimeout(() => void checkAnchor(), ANCHOR_RECHECK_MS);
            };
            await checkAnchor();
        })();
        return () => {
            canceled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, address, peerPubKey, blob, orderHash, counterparty, publicClient, chainId, decrypt, expectedAnchor, ceremonyKey]);

    return { channel, peerPubKey, requested, requestedHere, markRequested, received, anchored, anchoredEach };
}

/** How long a receiver waits before it reads the order's attestations again. */
const ANCHOR_RECHECK_MS = 3000;

const NO_VERDICTS: readonly boolean[] = [];

type SignAuth = (message: string) => Promise<`0x${string}`>;

export interface UseCeremonyPanelOptions<T>
    extends Pick<UseCeremonyChannelOptions<T>, "ceremonyId" | "expectedAnchor"> {
    /** The codec's decrypt (decryptAddressDetail, decryptContentDelivery,
     *  decryptPrivateFilings) — a stable module-level function. */
    decryptBlob: (args: {
        myAddress: `0x${string}`;
        orderId: string;
        senderPubKeyHex: string;
        blobB64: string;
    }) => Promise<T | null>;
    orderHash: string;
    buyer: string;
    seller: string;
    /** The request control's words for each seat: what one seat asks for
     *  may differ from what the other asks for, the ceremony does not. */
    requestLabels: Record<PartyRole, string>;
    /** The codec's request call (requestAddressDetail, requestContentDelivery,
     *  requestPrivateFilings). */
    request: (
        channel: HandoffChannel,
        params: { myAddress: string; recipientAddress: string; orderId: string; signAuth: SignAuth },
    ) => Promise<unknown>;
}

/** What a panel's send step hands back: its result, and the attestation that
 *  anchors what it sent, where the send files one (the private filings
 *  deliver content already attested, and file none). */
export interface CeremonyDelivery<R> {
    result: R;
    attestation?: {
        /** The declaring clause's key — the attestation anchors under it. */
        clauseId: string;
        stage: number;
        content: `0x${string}`;
        anchorFailureMessage: string;
    };
}

/**
 * The whole symmetric body of a ceremony panel: the connected wallet's seat on
 * the order, the channel, the request action, and `deliver` — send over the
 * channel, then file the attestation that anchors it, where there is one. A
 * panel supplies its codec (`decrypt`, `expectedAnchor`, `request`, and the
 * `build` it passes to `deliver`) and its JSX.
 */
export function useCeremonyPanel<T>(options: UseCeremonyPanelOptions<T>) {
    const { orderHash, buyer, seller, request, ceremonyId, decryptBlob, expectedAnchor, requestLabels } = options;
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const attestationActions = useAttestationCoordinatorActions();

    const role: PartyRole | null =
        address && hexEqual(address, seller) ? "seller"
        : address && hexEqual(address, buyer) ? "buyer"
        : null;
    const counterparty = role === "seller" ? buyer : seller;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const decrypt = useCallback(
        (args: { myAddress: `0x${string}`; senderPubKeyHex: string; blobB64: string }) =>
            decryptBlob({ ...args, orderId: orderHash }),
        [decryptBlob, orderHash],
    );
    const ceremony = useCeremonyChannel<T>({
        address, enabled: role !== null, ceremonyId, orderHash, counterparty, decrypt, expectedAnchor,
    });
    const { channel, peerPubKey, markRequested } = ceremony;

    const handleRequest = useCallback(async () => {
        if (!channel || !address || !walletClient) return;
        setBusy(true);
        setError(null);
        try {
            await request(channel, {
                myAddress: address,
                recipientAddress: counterparty,
                orderId: orderHash,
                signAuth: (message) => walletClient.signMessage({ message }),
            });
            markRequested();
        } catch (e) {
            setError(extractErrorMessage(e, "Request failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, walletClient, counterparty, orderHash, markRequested, request]);

    const deliver = useCallback(async <R,>(
        failureMessage: string,
        build: (ctx: {
            channel: HandoffChannel;
            address: `0x${string}`;
            peerPubKey: string;
            counterparty: string;
            signAuth: SignAuth;
        }) => Promise<CeremonyDelivery<R>>,
    ): Promise<R | undefined> => {
        if (!channel || !address || !peerPubKey || !walletClient || !role) return undefined;
        setBusy(true);
        setError(null);
        try {
            const { attestation, result } = await build({
                channel, address, peerPubKey, counterparty,
                signAuth: (message) => walletClient.signMessage({ message }),
            });
            if (attestation) {
                await attestationActions.submitAttestation(role, {
                    orderHash: orderHash as `0x${string}`,
                    clauseId: attestation.clauseId as `0x${string}`,
                    stage: attestation.stage,
                    content: attestation.content,
                    failureMessage: attestation.anchorFailureMessage,
                });
            }
            return result;
        } catch (e) {
            setError(extractErrorMessage(e, failureMessage));
            return undefined;
        } finally {
            setBusy(false);
        }
    }, [channel, address, peerPubKey, walletClient, counterparty, orderHash, attestationActions, role]);

    // The waiting line names the seat the request is waiting on.
    const waitingLabel = `Requested — waiting for the ${role === "seller" ? "buyer" : "seller"}`;
    const requestLabel = role ? requestLabels[role] : "";
    return { ...ceremony, role, counterparty, busy, error, handleRequest, deliver, waitingLabel, requestLabel };
}
