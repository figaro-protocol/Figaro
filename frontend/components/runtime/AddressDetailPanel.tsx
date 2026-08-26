"use client";

/**
 * AddressDetailPanel — the surface for the `ecdh-address` interaction
 * standard: the private-address ceremony on an order whose clause commits
 * public geohashes (the geolocation clause declares this interaction).
 *
 * SYMMETRIC over one order edge (the kernel star shape routes the secrets:
 * this order's buyer↔seller ARE the two parties who need the detail).
 * Either party may REQUEST (ephemeral pubkey over the coordination channel)
 * and either may ANSWER (the addressee block — name, street, floor/door,
 * delivery instructions, notify-party lines, handling marks —
 * ECDH-encrypted to the counterparty and hash-anchored
 * on-chain as that party's attestation on the declaring clause's section;
 * tamper-evidence, corrections supersede). The courier requests the buyer's
 * drop-off door; in a private transaction the buyer requests the seller's
 * precise pickup point the same way. The chain never learns the plaintext.
 *
 * The channel subscription, authentication contract, and anchor polling
 * live in `useCeremonyChannel`; this panel owns the addressee-block codec
 * and the JSX.
 *
 * Mounted by the interactionSurfaces registry — this component knows no
 * clause; `clauseId` identifies the declaring section for the anchor and
 * the title, never a dispatch.
 */
import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
    addressDetailAnchorRef,
    addressDetailBlobHash,
    decryptAddressDetail,
    requestAddressDetail,
    sendAddressDetail,
    type AddresseeBlock,
} from "@/lib/handoff/addressDetail";
import { useCeremonyChannel } from "@/lib/handoff/useCeremonyChannel";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { InteractionSurfaceProps } from "@/components/runtime/interactionSurfaces";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";

export function AddressDetailPanel({ processId, orderHash, clauseId, buyer, seller }: InteractionSurfaceProps) {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const attestationActions = useAttestationCoordinatorActions();

    const role: PartyRole | null =
        address && hexEqual(address, seller) ? "seller"
        : address && hexEqual(address, buyer) ? "buyer"
        : null;

    const counterparty = role === "seller" ? buyer : seller;
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<AddresseeBlock>({
        name: "", street: "", unit: "", instructions: "",
        notifyName: "", notifyContact: "", handling: "",
    });

    const decrypt = useCallback(
        (args: { myAddress: `0x${string}`; senderPubKeyHex: string; blobB64: string }) =>
            decryptAddressDetail({
                myAddress: args.myAddress, orderId: orderHash,
                senderPubKeyHex: args.senderPubKeyHex, blobB64: args.blobB64,
            }),
        [orderHash],
    );
    // The anchor is keccak of the anchored blob hash — hash-only, the
    // chain never carries the ciphertext.
    const expectedAnchor = useCallback(
        (_decrypted: AddresseeBlock, blobB64: string) => addressDetailAnchorRef(blobB64),
        [],
    );

    // Both parties send ECDH pubkeys on the order id itself.
    const { channel, peerPubKey, requested, setRequested, received: detail, anchored } =
        useCeremonyChannel<AddresseeBlock>({
            address,
            enabled: role !== null,
            ceremonyId: orderHash,
            orderHash,
            counterparty,
            decrypt,
            expectedAnchor,
        });

    const handleRequest = useCallback(async () => {
        if (!channel || !address || !walletClient) return;
        setBusy(true);
        setError(null);
        try {
            await requestAddressDetail(channel, {
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
    }, [channel, address, walletClient, counterparty, orderHash, setRequested]);

    const handleSend = useCallback(async () => {
        if (!channel || !address || !peerPubKey || !walletClient || !role) return;
        setBusy(true);
        setError(null);
        try {
            const block: AddresseeBlock = {
                name: form.name.trim(),
                street: form.street.trim(),
                ...(form.unit?.trim() ? { unit: form.unit.trim() } : {}),
                ...(form.instructions?.trim() ? { instructions: form.instructions.trim() } : {}),
                ...(form.notifyName?.trim() ? { notifyName: form.notifyName.trim() } : {}),
                ...(form.notifyContact?.trim() ? { notifyContact: form.notifyContact.trim() } : {}),
                ...(form.handling?.trim() ? { handling: form.handling.trim() } : {}),
            };
            const { blobB64 } = await sendAddressDetail(channel, {
                myAddress: address, recipientAddress: counterparty, orderId: orderHash,
                recipientPubKeyHex: peerPubKey, block,
                signAuth: (message) => walletClient.signMessage({ message }),
            });
            // Anchor keccak256(blob) on-chain AS the attestation content —
            // hash-only, so the ciphertext never reaches calldata and stays
            // deletable on the channel; the coordinator merkle-binds the
            // section and hash-binds the content.
            const spec = getClauseSpec(clauseId);
            const anchorArgs = {
                orderHash: orderHash as `0x${string}`,
                clauseId: computeClauseKey(clauseId, spec?.version ?? 1),
                stage: 0,
                content: addressDetailBlobHash(blobB64),
                failureMessage: "Anchoring the address detail failed",
            };
            await attestationActions.submitAttestation(role, anchorArgs);
            setSent(true);
        } catch (e) {
            setError(extractErrorMessage(e, "Sending the address failed."));
        } finally {
            setBusy(false);
        }
    }, [channel, address, peerPubKey, walletClient, counterparty, orderHash, clauseId, form, attestationActions, role]);

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
            className="rounded border border-default bg-paper p-4 space-y-3"
            data-testid="interaction-address-panel"
        >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-ink-muted">Address detail (private)</p>
                <p className="text-[11px] text-ink-faint">{clauseTitle}</p>
            </div>
            <p className="text-xs text-ink-body">
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
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper text-ink-body hover:border-default-strong disabled:opacity-50"
                >
                    {requested ? waitingLabel : busy ? "Requesting…" : requestLabel}
                </button>
            )}

            {/* The counterparty's decrypted detail + the anchor verdict. */}
            {detail && (
                <div className="space-y-1" data-testid="interaction-address-detail">
                    <p className="text-sm font-semibold text-ink-primary">{detail.name}</p>
                    <p className="text-sm text-ink-primary">{detail.street}</p>
                    {detail.unit && <p className="text-xs text-ink-body">{detail.unit}</p>}
                    {detail.instructions && (
                        <p className="text-xs text-ink-muted italic">{detail.instructions}</p>
                    )}
                    {detail.handling && (
                        <p className="text-xs font-semibold text-warning-fg" data-testid="interaction-address-detail-handling">
                            ⚠ {detail.handling}
                        </p>
                    )}
                    {detail.notifyName && (
                        <p className="text-xs text-ink-body" data-testid="interaction-address-detail-notify">
                            Notify on arrival: {detail.notifyName}
                            {detail.notifyContact ? ` — ${detail.notifyContact}` : ""}
                        </p>
                    )}
                    {anchored === "verified" && (
                        <p className="text-xs font-semibold text-success-fg" data-testid="interaction-address-verified">
                            ✓ Matches the on-chain anchor
                        </p>
                    )}
                    {anchored === "missing" && (
                        <p className="text-xs text-warning-fg" data-testid="interaction-address-unanchored">
                            No on-chain anchor found for this detail yet.
                        </p>
                    )}
                </div>
            )}

            {/* Share MY detail once the counterparty's key is known. */}
            {peerPubKey && !sent && (
                <div className="space-y-2 border-t border-default pt-3">
                    <p className="text-xs text-ink-body">
                        Share your door-level detail. It is encrypted to this order&apos;s
                        counterparty; only its fingerprint goes on-chain.
                    </p>
                    {([
                        ["name", "Addressee name", form.name],
                        ["street", "Street address", form.street],
                        ["unit", "Floor / door (optional)", form.unit ?? ""],
                        ["instructions", "Delivery instructions (optional)", form.instructions ?? ""],
                        ["handling", "Special handling (optional)", form.handling ?? ""],
                        ["notifyName", "Notify on arrival (optional)", form.notifyName ?? ""],
                        ["notifyContact", "Notify contact (optional)", form.notifyContact ?? ""],
                    ] as const).map(([key, label, value]) => (
                        <label key={key} className="block text-xs font-semibold text-ink-body">
                            {label}
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                data-testid={`interaction-address-${key}`}
                                className="mt-1 w-full text-xs px-2 py-1.5 border border-default rounded"
                            />
                        </label>
                    ))}
                    <button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={busy || !form.name.trim() || !form.street.trim()}
                        data-testid="interaction-address-send"
                        className="text-xs px-3 py-1.5 rounded bg-ink-primary text-paper hover:bg-ink-body disabled:opacity-50"
                    >
                        {busy ? "Encrypting + anchoring…" : "Send privately"}
                    </button>
                </div>
            )}
            {!peerPubKey && !sent && !requested && !detail && (
                <p className="text-[11px] text-ink-muted" data-testid="interaction-address-waiting">
                    Once either side requests, the other can share — encrypted to this
                    order alone.
                </p>
            )}
            {sent && (
                <p className="text-xs font-semibold text-success-fg" data-testid="interaction-address-sent">
                    ✓ Shared privately — fingerprint anchored on-chain
                </p>
            )}

            {error && <p className="text-xs text-error-fg" data-testid="interaction-address-error">{error}</p>}
        </section>
    );
}
