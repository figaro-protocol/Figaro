"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import {
    getAttestationsByOrder,
    parseAttestationLog,
    type AttestationRecord,
    type IndexedAttestationLog,
} from "@/lib/composition/indexer";
import { extractClauseData } from "@/lib/audit/clauseDataExtract";
import {
    verifyOrderCommitSignatures,
    type OrderSignatureVerdicts,
} from "@/lib/audit/signatureVerdicts";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import { extractProcessLogs } from "@/lib/audit/processLogsExtract";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";

/**
 * Clause evidence — the on-page rendering of the same `clauseData` +
 * `processLogs` documents the audit-bundle PDF carries, so the process's
 * clause evidence is visible as network state, not only inside a download.
 *
 * Fully OPEN-WORLD: both documents render EVERY committed clause and EVERY
 * attested process-log clause through the registered spec (title, field
 * labels, enum stage labels) via `describeClause` / `describeAttestation`.
 * No clause is named here and no field is assumed — a clause the protocol
 * has never seen surfaces from its own spec, with zero per-clause code.
 */
/** The per-party verdict rows beside an order's hash row. Signature bytes are
 *  re-verified from the commit transaction's calldata against the EXACT struct
 *  it carried (`lib/audit/signatureVerdicts`) — presentation only; the kernel
 *  verified the same signatures at commit time. */
function OrderSignatureRows({
    orderHash,
    verdicts,
}: {
    orderHash: string;
    verdicts: OrderSignatureVerdicts | undefined;
}) {
    if (!verdicts) return null;
    const rows = [
        { label: "Buyer signature", party: "buyer", verdict: verdicts.buyer },
        { label: "Seller signature", party: "seller", verdict: verdicts.seller },
    ] as const;
    return (
        <dl
            className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
            data-testid={`audit-signatures-${orderHash}`}
        >
            {rows.map(({ label, party, verdict }) => (
                <div key={party} className="contents">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd data-testid={`audit-sig-${party}-${orderHash}`}>
                        {verdict === "valid" && (
                            <span className="text-green-700 font-semibold">
                                &#10003; Valid &mdash; recovers to the committed {party}
                            </span>
                        )}
                        {verdict === "invalid" && (
                            <span className="text-red-700 font-semibold">
                                &#10007; Invalid &mdash; does not recover to the committed {party}
                            </span>
                        )}
                        {verdict === "unavailable" && (
                            <span className="text-ink-muted">
                                Unavailable &mdash; no readable commit calldata for this order
                            </span>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function ProcessClauseEvidence({ processId }: { processId: string }) {
    const orders = useProcessOrders(processId);
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    // Warm the chain→IPFS clause-spec cache at this surface's boundary, so the
    // generic extractors (`clauseIsProcessLog`, `describeClause`,
    // `describeAttestation`) resolve every clause's spec — INCLUDING a clause this
    // code has never seen. `version` bumps as specs land; it drives the recompute.
    const { version: clauseSpecsVersion } = useClauseSpecs();

    const agreementHashes = useMemo(
        () => orders.map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);

    // The process's attestation log, fetched per order and read clause-agnostically
    // (the same indexer read the PDF builder uses). Keyed by order id.
    const ordersKey = useMemo(() => orders.map((o) => o.orderHash).join(","), [orders]);
    const [attestationsByOrder, setAttestationsByOrder] = useState<Map<string, AttestationRecord[]>>(new Map());
    useEffect(() => {
        if (!publicClient || !chainId || orders.length === 0) {
            setAttestationsByOrder(new Map());
            return;
        }
        let cancelled = false;
        (async () => {
            const next = new Map<string, AttestationRecord[]>();
            await Promise.all(orders.map(async (order) => {
                try {
                    const logs = await getAttestationsByOrder(publicClient, chainId, order.orderHash);
                    next.set(order.orderHash, (logs as IndexedAttestationLog[])
                        .map(parseAttestationLog)
                        .filter((r): r is AttestationRecord => r !== null));
                } catch {
                    next.set(order.orderHash, []);
                }
            }));
            if (!cancelled) setAttestationsByOrder(next);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersKey, chainId, publicClient]);

    // Per-order signature verdicts: the commit transaction's calldata is the
    // only on-chain home of the signature bytes, so the reader re-verifies them
    // there (same per-order fetch shape as the attestations above).
    const [signaturesByOrder, setSignaturesByOrder] = useState<Map<string, OrderSignatureVerdicts>>(new Map());
    useEffect(() => {
        if (!publicClient || !chainId || orders.length === 0) {
            setSignaturesByOrder(new Map());
            return;
        }
        let cancelled = false;
        (async () => {
            const next = new Map<string, OrderSignatureVerdicts>();
            await Promise.all(orders.map(async (order) => {
                try {
                    next.set(order.orderHash, await verifyOrderCommitSignatures(publicClient, chainId, order.orderHash));
                } catch {
                    // Leave the order without a verdict — rows simply don't render.
                }
            }));
            if (!cancelled) setSignaturesByOrder(next);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersKey, chainId, publicClient]);

    // NOTE: witness VALUES are not recoverable here, by design. The
    // coordinator takes `bytes32 contentRef` — a fingerprint — and the preimage
    // never enters calldata (the WS2 seam: a private value's plaintext never
    // touches public, permanent calldata). This reader therefore shows the
    // fingerprint the chain actually holds; a party holding the preimage proves
    // it by recomputing keccak256 and comparing. Publishing public-disposition
    // witness content so a reader could render the values is a separate,
    // punch-listed capability — NOT something to fake by decoding calldata,
    // which is what the removed path silently failed at.

    // Per-order evidence: committed clause data (from the agreement) + the
    // sovereign process-log timelines (from the attestations). Both via the
    // existing generic extractors — no new projection.
    const perOrder = useMemo(() => {
        return orders.map((order) => {
            const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
            const clauseData = agreement ? extractClauseData(order, agreement) : null;
            const processLogs = extractProcessLogs(order, attestationsByOrder.get(order.orderHash) ?? []);
            return { order, clauseData, processLogs };
        }).filter(({ clauseData, processLogs }) =>
            (clauseData && clauseData.clauses.length > 0) || processLogs.logs.length > 0,
        );
    }, [orders, agreements, attestationsByOrder, clauseSpecsVersion]);

    return (
        <section data-testid="audit-clause-evidence" className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-heading-h3 text-ink-heading">Clause evidence</h2>
                <p className="text-sm text-ink-body max-w-2xl">
                    Every clause committed on this process, and every process-log
                    attestation recorded against it, rendered from its registered
                    spec &mdash; title, field labels, and stage labels. The same
                    documents the audit-bundle PDF carries; names no clause and
                    assumes no field.
                </p>
            </div>

            {perOrder.length === 0 ? (
                <p className="text-sm text-ink-muted">No clause evidence recorded for this process yet.</p>
            ) : (
                <div className="space-y-8">
                    {perOrder.map(({ order, clauseData, processLogs }) => (
                        <div key={order.orderHash} className="space-y-5 border border-default rounded-section p-5">
                            <p className="text-xs font-mono text-ink-muted break-all">order {order.orderHash}</p>
                            <OrderSignatureRows
                                orderHash={order.orderHash}
                                verdicts={signaturesByOrder.get(order.orderHash)}
                            />

                            {clauseData && clauseData.clauses.length > 0 && (
                                <div className="space-y-4">
                                    {clauseData.clauses.map((clause) => (
                                        <div key={`data-${clause.clauseId}`} className="space-y-2">
                                            <h3 className="text-sm font-semibold text-ink-heading">{clause.title}</h3>
                                            {clause.fields.length === 0 ? (
                                                <p className="text-sm text-ink-muted">Committed with no field values.</p>
                                            ) : (
                                                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
                                                    {clause.fields.map((field) => (
                                                        <div key={field.name} className="contents">
                                                            <dt className="text-ink-muted">{field.label}</dt>
                                                            <dd className="text-ink-body">{field.values.join(", ")}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            )}
                                            {/* The reader's verification affordance — renders only for a
                                                leaf declaring a register template + declared id. */}
                                            <CredentialVerifyButton
                                                data={Object.fromEntries(clause.fields.map((f) => [f.name, f.values[0]]))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {processLogs.logs.map((group) => (
                                <div key={`log-${group.clauseId}`} className="space-y-2">
                                    <h3 className="text-sm font-semibold text-ink-heading">{group.title}</h3>
                                    <ul className="space-y-1 text-sm">
                                        {group.events.map((event, i) => (
                                            <li key={`${group.clauseId}-${i}`} className="text-ink-body">
                                                <div className="flex flex-wrap gap-x-3">
                                                    <span className="text-ink-heading">
                                                        {describeAttestation(group.clauseId, event.stage).eventLabel}
                                                    </span>
                                                    <span className="text-ink-muted font-mono text-xs break-all">
                                                        {event.attester}
                                                    </span>
                                                    <span className="text-ink-muted text-xs">block {event.blockNumber}</span>
                                                </div>
                                                {/* The evidence the chain actually carries: a fingerprint of
                                                    what was attested, timestamped and tamper-proof. Anyone
                                                    holding the preimage proves the match off-chain. */}
                                                <dl
                                                    className="mt-1 ml-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
                                                    data-testid={`audit-content-ref-${group.clauseId}-${event.stage}`}
                                                >
                                                    <dt className="text-ink-muted">Content fingerprint</dt>
                                                    <dd className="text-ink-body font-mono break-all">{event.contentRef}</dd>
                                                </dl>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
