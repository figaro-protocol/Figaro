"use client";

/**
 * AddressDetailPanel — the surface for the `ecdh-address-v1` interaction
 * standard: the private-address ceremony on an order whose clause commits
 * public geohashes (the geolocation clause declares this interaction).
 *
 * SYMMETRIC over one order edge (the kernel star shape routes the secrets:
 * this order's buyer↔seller ARE the two parties who need the detail).
 * Either party may REQUEST (ephemeral pubkey over the coordination channel)
 * and either may ANSWER (the addressee block — name, street, floor/door,
 * instructions — ECDH-encrypted to the counterparty and hash-anchored
 * on-chain as that party's attestation on the declaring clause's section;
 * tamper-evidence, corrections supersede). The courier requests the buyer's
 * drop-off door; in a private transaction the buyer requests the seller's
 * precise pickup point the same way. The chain never learns the plaintext.
 *
 * Mounted by the interactionSurfaces registry — this component knows no
 * clause; `clauseId` identifies the declaring section for the anchor and
 * the title, never a dispatch.
 */
import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { getCoordinationChannel, type CoordinationChannel } from "@/lib/handoff/channel";
import {
    addressDetailAnchorRef,
    addressDetailBlobHash,
    decryptAddressDetail,
    requestAddressDetail,
    sendAddressDetail,
    type AddresseeBlock,
} from "@/lib/handoff/addressDetail";
import { getOrderEcdhKeypair } from "@/lib/handoff/ecdh";
import { getAttestationsByOrder, parseAttestationLog } from "@/lib/composition/indexer";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { clauseIdHash, hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { InteractionSurfaceProps } from "@/components/core/interactionSurfaces";

export function AddressDetailPanel({ processId, orderHash, clauseId, buyer, seller }: InteractionSurfaceProps) {
    const { address } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const attestationActions = useAttestationCoordinatorActions();

    const role: "buyer" | "seller" | null =
        address && hexEqual(address, seller) ? "seller"
        : address && hexEqual(address, buyer) ? "buyer"
        : null;

    const counterparty = role === "seller" ? buyer : seller;
    const [channel, setChannel] = useState<CoordinationChannel | null>(null);
    const [peerPubKey, setPeerPubKey] = useState<string | null>(null);
    const [blob, setBlob] = useState<string | null>(null);
    const [requested, setRequested] = useState(false);
    const [detail, setDetail] = useState<AddresseeBlock | null>(null);
    const [anchored, setAnchored] = useState<"unknown" | "verified" | "missing">("unknown");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<AddresseeBlock>({ name: "", street: "", unit: "", instructions: "" });

    // The channel (mock in e2e, XMTP live) + subscriptions. Both parties send
    // ECDH pubkeys on the same order id — each side keeps the one that isn't
    // its own message (the mock replays to late subscribers).
    useEffect(() => {
        if (!address || !role) return;
        let disposed = false;
        const unsubs: Array<() => void> = [];
        void getCoordinationChannel(address).then((ch) => {
            if (disposed) return;
            setChannel(ch);
            unsubs.push(ch.onEcdhPubkey(orderHash, (pubKeyHex, senderIdentity) => {
                if (hexEqual(senderIdentity, address)) return; // my own message
                setPeerPubKey(pubKeyHex);
            }));
            unsubs.push(ch.onWrappedKey(orderHash, (wrappedKeyB64, senderIdentity) => {
                if (hexEqual(senderIdentity, address)) return;
                setBlob(wrappedKeyB64);
            }));
        });
        // A keypair in sessionStorage marks a request already sent this session.
        setRequested(getOrderEcdhKeypair(address, orderHash) !== null);
        return () => {
            disposed = true;
            for (const u of unsubs) u();
        };
    }, [address, role, orderHash]);

    // Decrypt the counterparty's blob once both halves arrived, then verify
    // against the on-chain anchor (the attestation whose contentRef is
    // keccak256 of the anchored blob hash — hash-only, the chain never
    // carries the ciphertext). The anchor tx can confirm AFTER the channel messages
    // arrive, so the verification POLLS until it lands (the event cache
    // makes re-reads cheap). Symmetric: either side receives this way.
    useEffect(() => {
        if (!role || !address || !peerPubKey || !blob) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expected = addressDetailAnchorRef(blob).toLowerCase();
        const checkAnchor = async () => {
            if (!publicClient || cancelled) return;
            const logs = await getAttestationsByOrder(publicClient, chainId, orderHash);
            if (cancelled) return;
            const verified = logs.some((log) => {
                const record = parseAttestationLog(log);
                return record !== null && record.contentRef.toLowerCase() === expected;
            });
            setAnchored(verified ? "verified" : "missing");
            if (!verified) timer = setTimeout(() => void checkAnchor(), 3000);
        };
        void (async () => {
            const decrypted = await decryptAddressDetail({
                myAddress: address, orderId: orderHash, senderPubKeyHex: peerPubKey, blobB64: blob,
            });
            if (cancelled) return;
            setDetail(decrypted);
            if (!decrypted) return;
            await checkAnchor();
        })();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [role, address, peerPubKey, blob, orderHash, publicClient, chainId]);

    const handleRequest = useCallback(async () => {
        if (!channel || !address) return;
        setBusy(true);
        setError(null);
        try {
            await requestAddressDetail(channel, { myAddress: address, recipientAddress: counterparty, orderId: orderHash });
            setRequested(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Request failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, counterparty, orderHash]);

    const handleSend = useCallback(async () => {
        if (!channel || !address || !peerPubKey) return;
        setBusy(true);
        setError(null);
        try {
            const block: AddresseeBlock = {
                name: form.name.trim(),
                street: form.street.trim(),
                ...(form.unit?.trim() ? { unit: form.unit.trim() } : {}),
                ...(form.instructions?.trim() ? { instructions: form.instructions.trim() } : {}),
            };
            const { blobB64 } = await sendAddressDetail(channel, {
                myAddress: address, recipientAddress: counterparty, orderId: orderHash,
                recipientPubKeyHex: peerPubKey, block,
            });
            // Anchor keccak256(blob) on-chain AS the attestation content —
            // hash-only, so the ciphertext never reaches calldata and stays
            // deletable on the channel; the coordinator merkle-binds the
            // section and hash-binds the content.
            const spec = getClauseSpec(clauseId);
            const anchorArgs = {
                orderHash: orderHash as `0x${string}`,
                clauseId: clauseIdHash(clauseId, spec?.version ?? 1),
                stage: 0,
                content: addressDetailBlobHash(blobB64),
                failureMessage: "Anchoring the address detail failed",
            };
            if (role === "buyer") await attestationActions.submitBuyerAttestation(anchorArgs);
            else await attestationActions.submitSellerAttestation(anchorArgs);
            setSent(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Sending the address failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, peerPubKey, counterparty, orderHash, clauseId, form, attestationActions, role]);

    if (!role) return null;
    const clauseTitle = getClauseSpec(clauseId)?.title ?? clauseId;
    // Role-flavored copy over ONE symmetric body: what I ask for and what I
    // might share differ by seat, the ceremony does not.
    const requestLabel = role === "seller" ? "Request delivery address" : "Request pickup address";
    const waitingLabel = role === "seller"
        ? "Requested — waiting for the buyer"
        : "Requested — waiting for the seller";

    return (
        <section
            className="rounded border border-neutral-200 bg-white p-4 space-y-3"
            data-testid="interaction-address-panel"
        >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-500">Address detail (private)</p>
                <p className="text-[11px] text-neutral-400">{clauseTitle}</p>
            </div>
            <p className="text-xs text-neutral-600">
                The agreement commits the geohash cells; door-level detail is shared
                privately here, encrypted to this order&apos;s counterparty alone, its
                fingerprint anchored on-chain.
            </p>

            {/* Ask for the counterparty's detail. */}
            {!detail && (
                <button
                    type="button"
                    onClick={() => void handleRequest()}
                    disabled={busy || !channel || requested}
                    data-testid="interaction-address-request"
                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                >
                    {requested ? waitingLabel : busy ? "Requesting…" : requestLabel}
                </button>
            )}

            {/* The counterparty's decrypted detail + the anchor verdict. */}
            {detail && (
                <div className="space-y-1" data-testid="interaction-address-detail">
                    <p className="text-sm font-semibold text-black">{detail.name}</p>
                    <p className="text-sm text-neutral-800">{detail.street}</p>
                    {detail.unit && <p className="text-xs text-neutral-700">{detail.unit}</p>}
                    {detail.instructions && (
                        <p className="text-xs text-neutral-500 italic">{detail.instructions}</p>
                    )}
                    {anchored === "verified" && (
                        <p className="text-xs font-semibold text-green-700" data-testid="interaction-address-verified">
                            ✓ Matches the on-chain anchor
                        </p>
                    )}
                    {anchored === "missing" && (
                        <p className="text-xs text-amber-700" data-testid="interaction-address-unanchored">
                            No on-chain anchor found for this detail yet.
                        </p>
                    )}
                </div>
            )}

            {/* Share MY detail once the counterparty's key is known. */}
            {peerPubKey && !sent && (
                <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <p className="text-xs text-neutral-600">
                        Share your door-level detail. It is encrypted to this order&apos;s
                        counterparty; only its fingerprint goes on-chain.
                    </p>
                    {([
                        ["name", "Addressee name", form.name],
                        ["street", "Street address", form.street],
                        ["unit", "Floor / door (optional)", form.unit ?? ""],
                        ["instructions", "Special instructions (optional)", form.instructions ?? ""],
                    ] as const).map(([key, label, value]) => (
                        <label key={key} className="block text-xs font-semibold text-neutral-700">
                            {label}
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                data-testid={`interaction-address-${key}`}
                                className="mt-1 w-full text-xs px-2 py-1.5 border border-neutral-300 rounded"
                            />
                        </label>
                    ))}
                    <button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={busy || !form.name.trim() || !form.street.trim()}
                        data-testid="interaction-address-send"
                        className="text-xs px-3 py-1.5 rounded bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                        {busy ? "Encrypting + anchoring…" : "Send privately"}
                    </button>
                </div>
            )}
            {!peerPubKey && !sent && !requested && !detail && (
                <p className="text-[11px] text-neutral-500" data-testid="interaction-address-waiting">
                    Once either side requests, the other can share — encrypted to this
                    order alone.
                </p>
            )}
            {sent && (
                <p className="text-xs font-semibold text-green-700" data-testid="interaction-address-sent">
                    ✓ Shared privately — fingerprint anchored on-chain
                </p>
            )}

            {error && <p className="text-xs text-red-600" data-testid="interaction-address-error">{error}</p>}
        </section>
    );
}
