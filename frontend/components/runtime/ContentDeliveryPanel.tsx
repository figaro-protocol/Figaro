"use client";

/**
 * ContentDeliveryPanel — the surface for the `ecdh-content` interaction
 * standard: the counterparty-private content ceremony on an order whose
 * clause commits a digital hand-off (the declaring clause's
 * `encrypted-transfer` mode; its other modes — repository-grant,
 * public-release — need no ceremony and run through the stage-1 witness
 * form alone).
 *
 * SYMMETRIC over one order edge, like the address ceremony: either party
 * may REQUEST (ephemeral pubkey over the coordination channel) and either
 * may ANSWER (the artifact, ECDH-encrypted to the counterparty). The
 * answering party files the spec's stage-1 attestation with the artifact's
 * keccak256 — the completion evidence, merkle-bound to the agreement — and
 * the receiver verifies by REHASHING what it decrypted against that
 * on-chain anchor. The chain never learns the bytes.
 *
 * Mounted by the interactionSurfaces registry — this component knows no
 * clause; `clauseId` identifies the declaring section for the attestation
 * and the title, never a dispatch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { keccak256 } from "viem";
import { getHandoffChannel } from "@/lib/handoff/channel";
import { verifyEcdhMessageAuth, type AuthenticatedEcdhMessage, type HandoffChannel } from "@figaro/sdk/handoff";
import { encodeContentFromSpec } from "@figaro/sdk/clauses";
import {
    CONTENT_DELIVERY_MAX_BYTES,
    contentCeremonyId,
    decryptContentDelivery,
    requestContentDelivery,
    sendContentDelivery,
    type DeliveredContent,
} from "@/lib/handoff/contentDelivery";
import { getOrderEcdhKeypair } from "@/lib/handoff/ecdh";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { attestationAnchorMatches, type AnchorVerificationState } from "@/components/runtime/handoffAnchorState";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { computeClauseKey } from "@figaro/sdk";
import { hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { InteractionSurfaceProps } from "@/components/runtime/interactionSurfaces";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";

/** The stage the declaring clause's completion evidence files at. */
const COMPLETION_STAGE = 1;

export function ContentDeliveryPanel({ processId, orderHash, clauseId, buyer, seller }: InteractionSurfaceProps) {
    const { address } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const attestationActions = useAttestationCoordinatorActions();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const role: PartyRole | null =
        address && hexEqual(address, seller) ? "seller"
        : address && hexEqual(address, buyer) ? "buyer"
        : null;

    const counterparty = role === "seller" ? buyer : seller;
    const ceremonyId = contentCeremonyId(orderHash);
    const [channel, setChannel] = useState<HandoffChannel | null>(null);
    const [peerPubKey, setPeerPubKey] = useState<string | null>(null);
    const [blob, setBlob] = useState<string | null>(null);
    const [requested, setRequested] = useState(false);
    const [received, setReceived] = useState<DeliveredContent | null>(null);
    const [anchored, setAnchored] = useState<AnchorVerificationState>("unknown");
    const [sent, setSent] = useState<`0x${string}` | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The channel (mock in e2e, XMTP live) + subscriptions — the same
    // verify-and-skip contract as every ceremony: transport identity is
    // untrusted, each message must carry a wallet signature recovering to
    // this order's counterparty; failures are skipped, never terminal.
    useEffect(() => {
        if (!address || !role) return;
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
    }, [address, role, ceremonyId, counterparty]);

    // Decrypt once both halves arrived, rehash, then verify the rehash
    // against the on-chain stage-1 attestation (its content is the encoded
    // {contentHash} struct; the event binds contentRef = keccak(content)).
    // The attestation tx can confirm AFTER the channel messages arrive, so
    // the verification POLLS until it lands.
    useEffect(() => {
        if (!role || !address || !peerPubKey || !blob) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        void (async () => {
            const delivered = await decryptContentDelivery({
                myAddress: address, orderId: orderHash, senderPubKeyHex: peerPubKey, blobB64: blob,
            });
            if (cancelled) return;
            setReceived(delivered);
            if (!delivered) return;
            const spec = getClauseSpec(clauseId);
            if (!spec) return;
            const expected = keccak256(
                encodeContentFromSpec(spec, { contentHash: delivered.contentHash }, { stage: COMPLETION_STAGE }),
            );
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
    }, [role, address, peerPubKey, blob, orderHash, clauseId, publicClient, chainId]);

    const handleRequest = useCallback(async () => {
        if (!channel || !address || !walletClient) return;
        setBusy(true);
        setError(null);
        try {
            await requestContentDelivery(channel, {
                myAddress: address,
                recipientAddress: counterparty,
                orderId: orderHash,
                signAuth: (message) => walletClient.signMessage({ message }),
            });
            setRequested(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Request failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, walletClient, counterparty, orderHash]);

    const handleSend = useCallback(async (file: File) => {
        if (!channel || !address || !peerPubKey || !walletClient) return;
        setBusy(true);
        setError(null);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const { contentHash } = await sendContentDelivery(channel, {
                myAddress: address, recipientAddress: counterparty, orderId: orderHash,
                recipientPubKeyHex: peerPubKey,
                artifact: { name: file.name, mediaType: file.type || "application/octet-stream", bytes },
                signAuth: (message) => walletClient.signMessage({ message }),
            });
            // File the spec's stage-1 completion evidence: the artifact's
            // keccak256, encoded per the declaring clause's own stage shape
            // and merkle-bound by the coordinator. The URI field stays
            // omitted — counterparty-private transfers have no locator.
            const spec = getClauseSpec(clauseId);
            if (!spec) throw new Error(`Clause spec not loaded: ${clauseId}`);
            const attestArgs = {
                orderHash: orderHash as `0x${string}`,
                clauseId: computeClauseKey(clauseId, spec.version),
                stage: COMPLETION_STAGE,
                content: encodeContentFromSpec(spec, { contentHash }, { stage: COMPLETION_STAGE }),
                failureMessage: "Anchoring the completion evidence failed",
            };
            if (role === "buyer") await attestationActions.submitBuyerAttestation(attestArgs);
            else await attestationActions.submitSellerAttestation(attestArgs);
            setSent(contentHash);
        } catch (e) {
            setError(extractErrorMessage(e, "Delivering the content failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, peerPubKey, walletClient, counterparty, orderHash, clauseId, attestationActions, role]);

    const handleDownload = useCallback(() => {
        if (!received) return;
        const url = URL.createObjectURL(new Blob([received.bytes as BlobPart], { type: received.mediaType }));
        const a = document.createElement("a");
        a.href = url;
        a.download = received.name;
        a.click();
        URL.revokeObjectURL(url);
    }, [received]);

    if (!role) return null;
    const clauseTitle = getClauseSpec(clauseId)?.title ?? clauseId;
    // Role-flavored copy over ONE symmetric body: the buyer asks for the
    // deliverable, a seller may ask for source materials the same way.
    const requestLabel = role === "buyer" ? "Request the deliverable" : "Request counterparty content";
    const waitingLabel = role === "buyer"
        ? "Requested — waiting for the seller"
        : "Requested — waiting for the buyer";

    return (
        <section
            className="rounded border border-neutral-200 bg-white p-4 space-y-3"
            data-testid="interaction-content-panel"
        >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-500">Content delivery (private)</p>
                <p className="text-[11px] text-neutral-400">{clauseTitle}</p>
            </div>
            <p className="text-xs text-neutral-600">
                The artifact travels encrypted to this order&apos;s counterparty alone;
                its keccak256 anchors on-chain as the completion evidence. The chain
                never learns the bytes.
            </p>

            {/* Ask for the counterparty's content. */}
            {!received && (
                <button
                    type="button"
                    onClick={() => void handleRequest()}
                    disabled={busy || !channel || requested}
                    data-testid="interaction-content-request"
                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                >
                    {requested ? waitingLabel : busy ? "Requesting…" : requestLabel}
                </button>
            )}

            {/* The decrypted deliverable + the anchor verdict. */}
            {received && (
                <div className="space-y-1" data-testid="interaction-content-received">
                    <p className="text-sm font-semibold text-black">{received.name}</p>
                    <p className="text-xs text-neutral-700">
                        {received.mediaType} · {received.bytes.length.toLocaleString()} bytes
                    </p>
                    <p className="text-[11px] font-mono text-neutral-500 break-all" data-testid="interaction-content-hash">
                        {received.contentHash}
                    </p>
                    {anchored === "verified" && (
                        <p className="text-xs font-semibold text-green-700" data-testid="interaction-content-verified">
                            ✓ Rehash matches the on-chain completion evidence
                        </p>
                    )}
                    {anchored === "missing" && (
                        <p className="text-xs text-amber-700" data-testid="interaction-content-unanchored">
                            No on-chain completion evidence found for this artifact yet.
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={handleDownload}
                        data-testid="interaction-content-download"
                        className="text-xs px-3 py-1.5 rounded bg-black text-white hover:bg-neutral-800"
                    >
                        Save the artifact
                    </button>
                </div>
            )}

            {/* Deliver MY artifact once the counterparty's key is known. */}
            {peerPubKey && !sent && (
                <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <p className="text-xs text-neutral-600">
                        Deliver the artifact ({Math.round(CONTENT_DELIVERY_MAX_BYTES / 1024)} KiB max —
                        larger deliverables use the repository-grant or public-release mode).
                        It is encrypted to this order&apos;s counterparty; only its keccak256
                        goes on-chain.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        disabled={busy}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleSend(file);
                        }}
                        data-testid="interaction-content-file"
                        className="block w-full text-xs text-neutral-700 file:mr-2 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:text-neutral-700 hover:file:border-neutral-500"
                    />
                    {busy && <p className="text-xs text-neutral-500">Encrypting + anchoring…</p>}
                </div>
            )}
            {!peerPubKey && !sent && !requested && !received && (
                <p className="text-[11px] text-neutral-500" data-testid="interaction-content-waiting">
                    Once either side requests, the other can deliver — encrypted to this
                    order alone.
                </p>
            )}
            {sent && (
                <p className="text-xs font-semibold text-green-700" data-testid="interaction-content-sent">
                    ✓ Delivered privately — completion evidence anchored on-chain
                </p>
            )}

            {error && <p className="text-xs text-red-600" data-testid="interaction-content-error">{error}</p>}
        </section>
    );
}
