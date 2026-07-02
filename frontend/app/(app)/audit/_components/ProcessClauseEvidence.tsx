"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import { getAttestationsByOrder, type IndexedAttestationLog } from "@/lib/composition/indexer";
import { toAttestationRecord } from "@/lib/audit/auditBundlePdf";
import { extractClauseData } from "@/lib/audit/clauseDataExtract";
import { extractProcessLogs } from "@/lib/audit/processLogsExtract";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import type { AttestationRecord } from "@/lib/composition/useGHGDisclosure";

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
    const ordersKey = useMemo(() => orders.map((o) => o.id).join(","), [orders]);
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
                    const logs = await getAttestationsByOrder(publicClient, chainId, order.id);
                    next.set(order.id, (logs as IndexedAttestationLog[])
                        .map(toAttestationRecord)
                        .filter((r): r is AttestationRecord => r !== null));
                } catch {
                    next.set(order.id, []);
                }
            }));
            if (!cancelled) setAttestationsByOrder(next);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersKey, chainId, publicClient]);

    // Per-order evidence: committed clause data (from the agreement) + the
    // sovereign process-log timelines (from the attestations). Both via the
    // existing generic extractors — no new projection.
    const perOrder = useMemo(() => {
        return orders.map((order) => {
            const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
            const clauseData = agreement ? extractClauseData(order, agreement) : null;
            const processLogs = extractProcessLogs(order, attestationsByOrder.get(order.id) ?? []);
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
                        <div key={order.id} className="space-y-5 border border-default rounded-section p-5">
                            <p className="text-xs font-mono text-ink-muted break-all">order {order.id}</p>

                            {clauseData && clauseData.clauses.length > 0 && (
                                <div className="space-y-4">
                                    {clauseData.clauses.map((clause) => (
                                        <div key={`data-${clause.clauseId}`} className="space-y-2">
                                            <h3 className="text-sm font-semibold text-ink-heading">{clause.title}</h3>
                                            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
                                                {clause.fields.map((field) => (
                                                    <div key={field.name} className="contents">
                                                        <dt className="text-ink-muted">{field.label}</dt>
                                                        <dd className="text-ink-body">{field.values.join(", ")}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {processLogs.logs.map((group) => (
                                <div key={`log-${group.clauseId}`} className="space-y-2">
                                    <h3 className="text-sm font-semibold text-ink-heading">{group.title}</h3>
                                    <ul className="space-y-1 text-sm">
                                        {group.events.map((event, i) => (
                                            <li key={`${group.clauseId}-${i}`} className="flex flex-wrap gap-x-3 text-ink-body">
                                                <span className="text-ink-heading">
                                                    {describeAttestation(group.clauseId, event.stage).eventLabel}
                                                </span>
                                                <span className="text-ink-muted font-mono text-xs break-all">
                                                    {event.attester}
                                                </span>
                                                <span className="text-ink-muted text-xs">block {event.blockNumber}</span>
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
