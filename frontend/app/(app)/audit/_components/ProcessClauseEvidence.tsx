"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { useAuditProcessOrders } from "@/hooks/useAuditProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import {
    getAttestationsByOrder,
    parseAttestationLog,
    type AttestationRecord,
    type IndexedAttestationLog,
} from "@/lib/composition/indexer";
import { extractClauseData } from "@/lib/audit/clauseDataExtract";
import { fetchWitnessContent } from "@/lib/composition/witnessContent";
import { decodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { WitnessPinErasure } from "@/components/runtime/WitnessPinErasure";
import {
    verifyOrderCommitSignatures,
    type OrderSignatureVerdicts,
} from "@/lib/audit/signatureVerdicts";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import { extractProcessLogs } from "@/lib/audit/processLogsExtract";
import { clauseIdForHash, clauseWitnessStages, describeAttestation, describeWitness, getClauseSpec } from "@/lib/shared/clauseSpecSource";
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
/** The per-party verdict rows beside an order's hash row.
 *
 *  DIRECT path — signature bytes are re-verified here from the commit
 *  transaction's calldata against the EXACT struct it carried
 *  (`lib/audit/signatureVerdicts`); the kernel verified the same signatures at
 *  commit time.
 *
 *  BATCH path — there are no signature bytes on chain to re-verify, so the
 *  verdict is "proved": the guest checked both signatures inside the SP1 proof.
 *  It is deliberately styled apart from the green direct-path verdict and
 *  carries a provenance line, because the reader is trusting a proof they can
 *  independently check — not a signature they recomputed. Never merge the two
 *  presentations. */
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
                            <span className="text-success-fg font-semibold">
                                &#10003; Valid &mdash; recovers to the committed {party}
                            </span>
                        )}
                        {verdict === "invalid" && (
                            <span className="text-error-fg font-semibold">
                                &#10007; Invalid &mdash; does not recover to the committed {party}
                            </span>
                        )}
                        {verdict === "proved" && (
                            <span className="text-info-fg font-semibold">
                                &#9670; Proved in a batch &mdash; checked inside the proof, not recomputed here
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
            {verdicts.batch && (
                <div
                    className="col-span-2 mt-1 text-[11px] text-ink-muted"
                    data-testid={`audit-sig-batch-${orderHash}`}
                >
                    {verdicts.batch.batchId !== null
                        ? `Batch #${verdicts.batch.batchId} re-emitted this order's attestation, so both signatures were verified inside that proof or an earlier one in the same state-root chain. `
                        : "No log binds this order to a specific batch, so the statement is the weaker one: both signatures were verified inside some proof this verifier accepted. "}
                    You are trusting that proof rather than a signature recomputed here &mdash; check it against verifier{" "}
                    <span className="font-mono break-all">{verdicts.batch.verifier}</span>
                    {verdicts.batch.programVKey && (
                        <>
                            {" "}and program vkey <span className="font-mono break-all">{verdicts.batch.programVKey}</span>
                        </>
                    )}.
                </div>
            )}
        </dl>
    );
}

export function ProcessClauseEvidence({ processId }: { processId: string }) {
    // BOTH settlement universes: a batch-settled order emits no OrderCommitted,
    // so reading only the kernel would render no evidence and make the "proved"
    // signature verdict below unreachable.
    const { orders } = useAuditProcessOrders(processId);
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

    // Witness content, resolved from the fingerprint the chain carries: the
    // event's `contentRef` IS the keccak-CID of the published preimage (the
    // publication half lives in `lib/composition/witnessContent`), so a reader
    // derives the address from the event alone, verifies the bytes hash back
    // to the fingerprint, and decodes them through the same spec that declared
    // the stage. Private-disposition, withheld, or erased content resolves
    // absent — the receipt row still renders the fingerprint; a party holding
    // the preimage proves the match off-chain.
    //
    // Keyed by (clauseId, stage, contentRef) — NEVER the fingerprint alone:
    // the same bytes decode differently under different field sets, and two
    // clauses can legitimately fingerprint identical bytes (a ladder event's
    // `(uint8 0, "")` is byte-identical to a witness's first-ordinal enum with
    // an empty companion). One fetch per fingerprint; one decode per triple.
    const [witnessValues, setWitnessValues] = useState<Map<string, Record<string, unknown>>>(new Map());
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const next = new Map<string, Record<string, unknown>>();
            const jobs: Promise<void>[] = [];
            const contentByRef = new Map<string, Promise<`0x${string}` | null>>();
            for (const records of attestationsByOrder.values()) {
                for (const att of records) {
                    if (!att.contentRef) continue;
                    // The event carries the clauseId HASH; spec reads key on the
                    // readable id — resolve through the cache first.
                    const clauseId = clauseIdForHash(att.clauseId) ?? att.clauseId;
                    if (!clauseWitnessStages(clauseId).some((w) => w.stage === att.stage)) continue;
                    const witnessSpec = getClauseSpec(clauseId);
                    if (!witnessSpec) continue;
                    const key = `${clauseId}:${att.stage}:${att.contentRef}`;
                    if (next.has(key)) continue;
                    next.set(key, {}); // claim the triple; overwritten on decode
                    let pending = contentByRef.get(att.contentRef);
                    if (!pending) {
                        pending = fetchWitnessContent(att.contentRef);
                        contentByRef.set(att.contentRef, pending);
                    }
                    jobs.push(pending.then((content) => {
                        if (!content) {
                            next.delete(key);
                            return;
                        }
                        try {
                            next.set(key, decodeContentFromSpec(witnessSpec, content, { stage: att.stage }));
                        } catch {
                            // Garbage content — leave undecoded; the receipt row still renders.
                            next.delete(key);
                        }
                    }));
                }
            }
            await Promise.all(jobs);
            if (!cancelled) setWitnessValues(next);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attestationsByOrder, clauseSpecsVersion]);

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
                                        {group.events.map((event, i) => {
                                            const decoded = witnessValues.get(`${group.clauseId}:${event.stage}:${event.contentRef}`);
                                            const witness = decoded ? describeWitness(group.clauseId, event.stage, decoded) : null;
                                            return (
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
                                                    {/* The values behind the fingerprint, when their publication
                                                        resolves — fetched at the keccak-CID the fingerprint
                                                        derives, verified against it, decoded through the spec's
                                                        declared stage fields. Absent for private-disposition,
                                                        withheld, or erased content. */}
                                                    {witness && witness.fields.length > 0 && (
                                                        <dl
                                                            className="mt-1 ml-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
                                                            data-testid={`audit-witness-${group.clauseId}-${event.stage}`}
                                                        >
                                                            {witness.fields.map((field) => (
                                                                <div key={field.name} className="contents">
                                                                    <dt className="text-ink-muted">{field.label}</dt>
                                                                    <dd className="text-ink-body">{field.values.join(", ")}</dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ))}
                    {/* Controller-erasure for witness pins this node published —
                        sits with the data it erases (the attestation contentRefs
                        fetched above), mirroring the committed-agreement pin's
                        affordance in the dispute section. */}
                    <WitnessPinErasure
                        contentRefs={Array.from(new Set(
                            Array.from(attestationsByOrder.values()).flat().map((a) => a.contentRef).filter(Boolean),
                        ))}
                    />
                </div>
            )}
        </section>
    );
}
