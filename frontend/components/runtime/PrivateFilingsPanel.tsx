"use client";

/**
 * PrivateFilingsPanel — the private filings of one order, delivered to the
 * counterparty on its request (`lib/handoff/privateFilings.ts`): the third
 * use of the sealed ceremony, beside AddressDetailPanel and
 * ContentDeliveryPanel, through the same hook (`useCeremonyPanel`).
 *
 * Shown to the order's two parties only. The receiver's page shows it
 * where the order carries a private filing of the counterparty whose
 * content this browser does not hold: one control asks for them, and the
 * wallet signs the request. The attester's page shows it once the
 * counterparty's signed key is present (offered by a request, or with the
 * counterparty's own send) and this browser kept copies of its own private
 * filings for the order: one control seals and sends them, and says how
 * many. The receiver's page then keeps each entry that passes its
 * checks, and says how many it kept, how many wait for their attestation on
 * the chain, and how many it dropped. It prints no content: the readers of
 * the kept store (the comparison of filings, the audit page, the evidence
 * file) show the values, never the blinding value.
 *
 * Names no clause: every filing is read from the order's attestations and
 * the clause specs they name.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
    decryptPrivateFilings,
    filingsCeremonyId,
    heldOwnPrivateFilings,
    keepConfirmedPrivateFilings,
    privateFilingAnchors,
    privateFilingsNotHeld,
    requestPrivateFilings,
    sendPrivateFilings,
    type ReceivedPrivateFilings,
} from "@/lib/handoff/privateFilings";
import { useCeremonyPanel } from "@/lib/handoff/useCeremonyChannel";
import { hexEqual } from "@/lib/shared/evm";
import { Button } from "@/components/ui/Button";
import { CeremonyPanelFrame, CeremonyRequestButton } from "@/components/runtime/CeremonyPanelFrame";

interface Props {
    orderHash: string;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    /** The process's attestations, as the order page reads them. */
    attestations: readonly { orderHash: string; clauseId: string; stage: number; contentRef: string; attester: string }[];
    /** Called each time this browser keeps more of the counterparty's
     *  filings, so the page's readers read the store again. */
    onKept?: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Either seat asks for the same thing. */
const REQUEST_LABELS = { buyer: "Request the private filings", seller: "Request the private filings" } as const;

/** Each received entry's place, attested by the sender; a stable function,
 *  as the ceremony hook requires. */
const expectedAnchor = (received: ReceivedPrivateFilings, _blobB64: string, sender: string) =>
    privateFilingAnchors(received, sender);

export function PrivateFilingsPanel({ orderHash, buyer, seller, attestations, onKept }: Props) {
    const { address } = useAccount();
    const [sent, setSent] = useState<number | null>(null);
    const [kept, setKept] = useState(0);

    const {
        role, channel, peerPubKey, requested, received, anchoredEach, busy, error, handleRequest, deliver, waitingLabel, requestLabel,
    } = useCeremonyPanel<ReceivedPrivateFilings>({
        ceremonyId: filingsCeremonyId(orderHash), orderHash, buyer, seller,
        decryptBlob: decryptPrivateFilings, expectedAnchor, request: requestPrivateFilings, requestLabels: REQUEST_LABELS,
    });

    // Keep each entry as its attestation by the sender is found on the chain.
    const keptBefore = useRef(0);
    useEffect(() => {
        if (!received) return;
        const held = keepConfirmedPrivateFilings(received, anchoredEach);
        setKept(held);
        if (held > keptBefore.current) onKept?.();
        keptBefore.current = held;
    }, [received, anchoredEach, onKept]);

    const own = address ? heldOwnPrivateFilings(orderHash, attestations, address) : [];
    const counterparty = role === "buyer" ? seller : buyer;
    const notHeld = role ? privateFilingsNotHeld(orderHash, attestations, counterparty) : 0;

    const handleSend = useCallback(async () => {
        const count = await deliver("Sending the private filings failed.", async (ctx) => {
            const { count } = await sendPrivateFilings(ctx.channel, {
                myAddress: ctx.address, recipientAddress: ctx.counterparty, orderId: orderHash,
                recipientPubKeyHex: ctx.peerPubKey, filings: heldOwnPrivateFilings(orderHash, attestations, ctx.address),
                signAuth: ctx.signAuth,
            });
            // The filings are attested already: this send files nothing.
            return { result: count };
        });
        if (count !== undefined) setSent(count);
    }, [deliver, orderHash, attestations]);

    if (!role || !address || hexEqual(counterparty, address)) return null;
    const canSend = !!peerPubKey && own.length > 0 && sent === null;
    if (notHeld === 0 && !received && !canSend && sent === null) return null;

    const pending = received ? received.filings.length - kept : 0;
    const counterpartySeat = role === "buyer" ? "seller" : "buyer";

    return (
        <CeremonyPanelFrame testId="private-filings-panel" title="Private filings">
            <p className="text-xs text-ink-body">
                A private filing puts only its fingerprint on the chain; its attester&apos;s browser keeps the
                content. A copy travels sealed to the other party of this order, on its request, to a key that
                lives only in the requesting tab.
            </p>

            {notHeld > 0 && (
                <div className="space-y-1">
                    <p className="text-xs text-ink-body" data-testid="private-filings-not-held">
                        This order carries {plural(notHeld, "private filing", "private filings")} of the {counterpartySeat} whose
                        content this browser does not hold.
                    </p>
                    <CeremonyRequestButton
                        label={requestLabel} waitingLabel={waitingLabel} requested={requested} busy={busy}
                        ready={!!channel} onRequest={handleRequest} testId="private-filings-request"
                    />
                    <p className="text-[11px] text-ink-muted" data-testid="private-filings-wallet-note">
                        Your wallet signs the request. Keep this tab open until the {counterpartySeat} sends.
                    </p>
                </div>
            )}

            {received && (
                <div className="space-y-1" data-testid="private-filings-received">
                    {received.refusal && (
                        <p className="text-xs text-error-fg" data-testid="private-filings-refused">{received.refusal}</p>
                    )}
                    {kept > 0 && (
                        <p className="text-xs font-semibold text-success-fg" data-testid="private-filings-kept">
                            Kept {plural(kept, "private filing", "private filings")} from the {counterpartySeat}, each
                            matching its attestation on the chain.
                        </p>
                    )}
                    {pending > 0 && (
                        <p className="text-xs text-warning-fg" data-testid="private-filings-pending">
                            {pending} waiting for their attestation by the {counterpartySeat} on the chain.
                        </p>
                    )}
                    {received.dropped > 0 && !received.refusal && (
                        <p className="text-xs text-warning-fg" data-testid="private-filings-dropped">
                            {plural(received.dropped, "entry", "entries")} failed a check and {received.dropped === 1 ? "was" : "were"} dropped.
                            This tab has made its request; to receive a new copy, open this order in a new tab and
                            request there; the {counterpartySeat} reloads its page to send again.
                        </p>
                    )}
                </div>
            )}

            {canSend && (
                <div className="space-y-2 border-t border-default pt-3">
                    <p className="text-xs text-ink-body">
                        The {counterpartySeat} offered a key on this order, by asking for your private filings or by
                        sending its own. Yours can be sealed to that key; nothing goes on the chain.
                    </p>
                    <Button
                        type="button"
                        size="compact"
                        onClick={() => void handleSend()}
                        disabled={busy}
                        data-testid="private-filings-send"
                        className="py-1.5 rounded"
                    >
                        {busy ? "Sealing and sending…" : `Send the private filings (${own.length})`}
                    </Button>
                </div>
            )}
            {sent !== null && (
                <p className="text-xs font-semibold text-success-fg" data-testid="private-filings-sent">
                    Sent {plural(sent, "private filing", "private filings")}, sealed to the key the {counterpartySeat} offered.
                </p>
            )}

            {error && <p className="text-xs text-error-fg" data-testid="private-filings-error">{error}</p>}
        </CeremonyPanelFrame>
    );
}
