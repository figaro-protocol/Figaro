"use client";

/**
 * AddressDetailPanel — the surface for the `ecdh-address-v1` interaction
 * standard: the private-address ceremony on an order whose clause commits
 * public geohashes (the geolocation clause declares this interaction).
 *
 * Role-adaptive over one order edge (the kernel star shape routes the
 * secrets: this order's buyer↔seller ARE the two parties who need the
 * detail):
 *   - the SELLER (e.g. the courier) requests the detail after accepting —
 *     ephemeral pubkey over the coordination channel; later decrypts the
 *     answer and verifies it against the on-chain anchor.
 *   - the BUYER answers — fills the addressee block (name, street,
 *     floor/door, instructions), which is ECDH-encrypted to the seller and
 *     hash-anchored on-chain as a buyer attestation on the declaring
 *     clause's section (tamper-evidence; a correction is a superseding
 *     attestation). The chain never learns the plaintext.
 *
 * Mounted by the interactionSurfaces registry — this component knows no
 * clause; `clauseId` identifies the declaring section for the anchor and
 * the title, never a dispatch.
 */
import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { getCoordinationChannel, type CoordinationChannel } from "@/lib/handoff/channel";
import {
    addressDetailBlobHash,
    addressDetailContentBytes,
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

    // Seller: decrypt once both halves arrived, then verify against the
    // on-chain anchor (the attestation whose contentRef is the blob's hash).
    // The anchor tx can confirm AFTER the channel messages arrive, so the
    // verification POLLS until it lands (the event cache makes re-reads cheap).
    useEffect(() => {
        if (role !== "seller" || !address || !peerPubKey || !blob) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expected = addressDetailBlobHash(blob).toLowerCase();
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
                myAddress: address, orderId: orderHash, buyerPubKeyHex: peerPubKey, blobB64: blob,
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
            await requestAddressDetail(channel, { myAddress: address, buyerAddress: buyer, orderId: orderHash });
            setRequested(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Request failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, buyer, orderHash]);

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
                myAddress: address, sellerAddress: seller, orderId: orderHash,
                sellerPubKeyHex: peerPubKey, block,
            });
            // Anchor keccak256(blob) on-chain: a buyer attestation on the
            // declaring clause's committed section — the coordinator
            // merkle-binds the section and hash-binds the content.
            const spec = getClauseSpec(clauseId);
            await attestationActions.submitBuyerAttestation({
                orderHash: orderHash as `0x${string}`,
                clauseId: clauseIdHash(clauseId, spec?.version ?? 1),
                stage: 0,
                content: addressDetailContentBytes(blobB64),
                failureMessage: "Anchoring the address detail failed",
            });
            setSent(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Sending the address failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, peerPubKey, seller, orderHash, clauseId, form, attestationActions]);

    if (!role) return null;
    const clauseTitle = getClauseSpec(clauseId)?.title ?? clauseId;

    return (
        <section
            className="rounded border border-neutral-200 bg-white p-4 space-y-3"
            data-testid="interaction-address-panel"
        >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-500">Delivery address (private)</p>
                <p className="text-[11px] text-neutral-400">{clauseTitle}</p>
            </div>

            {role === "seller" && (
                <div className="space-y-2">
                    {!detail && (
                        <>
                            <p className="text-xs text-neutral-600">
                                The agreement commits the destination cell (geohash); the door-level
                                address is shared privately, encrypted to this order only.
                            </p>
                            <button
                                type="button"
                                onClick={() => void handleRequest()}
                                disabled={busy || !channel || requested}
                                data-testid="interaction-address-request"
                                className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                            >
                                {requested ? "Requested — waiting for the buyer" : busy ? "Requesting…" : "Request delivery address"}
                            </button>
                        </>
                    )}
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
                </div>
            )}

            {role === "buyer" && (
                <div className="space-y-2">
                    {!peerPubKey && !sent && (
                        <p className="text-xs text-neutral-600" data-testid="interaction-address-waiting">
                            The counterparty hasn&apos;t requested the address yet. Once they do,
                            you can share it here — encrypted to them alone.
                        </p>
                    )}
                    {peerPubKey && !sent && (
                        <div className="space-y-2">
                            <p className="text-xs text-neutral-600">
                                Share the door-level address. It is encrypted to this order&apos;s
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
                    {sent && (
                        <p className="text-xs font-semibold text-green-700" data-testid="interaction-address-sent">
                            ✓ Shared privately — fingerprint anchored on-chain
                        </p>
                    )}
                </div>
            )}

            {error && <p className="text-xs text-red-600" data-testid="interaction-address-error">{error}</p>}
        </section>
    );
}
