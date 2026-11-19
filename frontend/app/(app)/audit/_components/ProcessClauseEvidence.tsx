"use client";

import { useEffect, useMemo, useState } from "react";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";
import { usePublicClient } from "wagmi";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreementReads } from "@/hooks/useProcessAgreements";
import type { Agreement } from "@figaro-protocol/sdk";
import { getAttestationsByOrder, type AttestationRecord } from "@/lib/core/attestationIndexer";
import { attestationPathLabel } from "@/lib/core/attestationPath";
import { extractClauseData } from "@/lib/data/audit/clauseDataExtract";
import { heldWitnessReader, resolveHeldWitnessContent } from "@/lib/core/witnessContent";
import { useWitnessHolder } from "@/lib/core/useWitnessHolder";
import { decodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { WitnessPinErasure } from "@/components/runtime/WitnessPinErasure";
import {
    verifyOrderCommitSignatures,
    type OrderSignatureVerdicts,
} from "@/lib/data/audit/signatureVerdicts";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import { extractProcessLogs } from "@/lib/data/audit/processLogsExtract";
import { attestationIsWitness, describeAttestation, describeWitness, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/registries/useClauseSpecs";
import { MissingParts } from "./MissingParts";
import { RowBoundary } from "@/components/data/RowBoundary";
import type { MissingPart } from "@/lib/data/audit/types";
import { PENDING, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import type { Order } from "@/lib/core/store";

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
 *  (`lib/data/audit/signatureVerdicts`); the Core verified the same signatures at
 *  commit time.
 *
 *  BATCH path — the signature bytes sit in the batch transaction's operation
 *  stream, which this surface does not yet read, so the verdict is "proved":
 *  the guest checked both signatures inside the SP1 proof.
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
    // An "unavailable" verdict is the chain's answer that nothing carries the
    // order's signatures: its row's place stays empty, and the list of what
    // the evidence file lacks names it once.
    const rows = ([
        { label: "Buyer signature", party: "buyer", verdict: verdicts.buyer },
        { label: "Seller signature", party: "seller", verdict: verdicts.seller },
    ] as const).filter((row) => row.verdict !== "unavailable");
    if (rows.length === 0 && !verdicts.batch) return null;
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
                        {verdict === "indirect" && (
                            <span className="text-ink-muted">
                                Not a direct call &mdash; the commit went through another contract, so this transaction&rsquo;s calldata is not what FigaroCore verified
                            </span>
                        )}
                        {/* The Core recovers both signers at commit (`FigaroCore`), and on
                            the batch path the proof checks them, so a committed order's
                            signatures are the Core's. */}
                        <RowBoundary boundary="protocol-enforced" source="checked by the Core at commit, on either path" />
                    </dd>
                </div>
            ))}
            {verdicts.batch && (
                <div
                    className="col-span-2 mt-1 text-[11px] text-ink-muted"
                    data-testid={`audit-sig-batch-${orderHash}`}
                >
                    {verdicts.batch.batchId !== null
                        ? `Batch #${verdicts.batch.batchId} logged this order, so both signatures were verified inside that proof or an earlier one in the same state-root chain. `
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
    // Both resolution paths: the order readers fold the verifier's events
    // beside the Core's, so batched orders reach the verdict below. A failed
    // order read renders nothing.
    const read = useProcessOrders(processId);
    if (read.status !== "present") return null;
    return <ClauseEvidence orders={read.value} />;
}

function ClauseEvidence({ orders }: { orders: Order[] }) {
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    // Warm the chain→IPFS clause-spec cache at this surface's boundary, so the
    // generic extractors (`clauseIsProcessLog`, `describeClause`,
    // `describeAttestation`) resolve every clause's spec — INCLUDING a clause this
    // code has never seen. `version` bumps as specs land; it drives the recompute.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    // Whose kept copies this page reads: the wallet connected, on this chain.
    const holder = useWitnessHolder();

    const checkoutHashes = useMemo(
        () => orders.map((o) => o.checkoutHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    // Each agreement as a network read: one in flight shows the loading line in
    // its order's block, one that failed to load is named in the list of what
    // the evidence lacks.
    const agreementReads = useProcessAgreementReads(checkoutHashes);
    const agreements = useMemo(() => {
        const loaded = new Map<string, Agreement>();
        for (const [hash, read] of agreementReads) if (read.status === "present") loaded.set(hash, read.value);
        return loaded;
    }, [agreementReads]);

    // The process's attestation log, fetched per order and read clause-agnostically
    // (the same indexer read the PDF builder uses). Keyed by order id.
    const ordersKey = useMemo(() => orders.map((o) => o.orderHash).join(","), [orders]);
    // A failed attestation read is absent — never `[]`, which would read as
    // "no evidence recorded".
    const [attestationsRead, setAttestationsRead] = useState<NetworkRead<Map<string, AttestationRecord[]>>>(PENDING);
    // With no client or chain the reads are reset during render, on the render
    // the inputs change (`useDepsChanged`); the effects below fetch only.
    // The resets read only whether a client is there, so they are keyed on that.
    const evidenceInputsChanged = useDepsChanged([ordersKey, chainId, !!publicClient]);
    if (evidenceInputsChanged && (!publicClient || !chainId)) setAttestationsRead(PENDING);
    useEffect(() => {
        if (!publicClient || !chainId) return;
        let canceled = false;
        void readNetwork("ProcessClauseEvidence.attestations", async () => {
            const next = new Map<string, AttestationRecord[]>();
            await Promise.all(orders.map(async (order) => {
                next.set(order.orderHash, await getAttestationsByOrder(publicClient, chainId, order.orderHash));
            }));
            return next;
        }).then((next) => { if (!canceled) setAttestationsRead(next); });
        return () => { canceled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersKey, chainId, publicClient]);
    const attestationsByOrder = useMemo(
        () => (attestationsRead.status === "present" ? attestationsRead.value : new Map<string, AttestationRecord[]>()),
        [attestationsRead],
    );

    // Per-order signature verdicts: the commit transaction's calldata is the
    // only on-chain home of the signature bytes, so the reader re-verifies them
    // there (same per-order fetch shape as the attestations above). A read that
    // failed is absent: the order shows no rows, and the list of what the
    // evidence lacks names it.
    const [signaturesByOrder, setSignaturesByOrder] = useState<Map<string, NetworkRead<OrderSignatureVerdicts>>>(new Map());
    if (evidenceInputsChanged && (!publicClient || !chainId || orders.length === 0)) setSignaturesByOrder(new Map());
    useEffect(() => {
        if (!publicClient || !chainId || orders.length === 0) return;
        let canceled = false;
        (async () => {
            const next = new Map<string, NetworkRead<OrderSignatureVerdicts>>();
            await Promise.all(orders.map(async (order) => {
                next.set(order.orderHash, await readNetwork(
                    "ProcessClauseEvidence.signatures",
                    () => verifyOrderCommitSignatures(publicClient, chainId, order.orderHash),
                ));
            }));
            if (!canceled) setSignaturesByOrder(next);
        })();
        return () => { canceled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersKey, chainId, publicClient]);

    // Witness content, resolved from the fingerprint the chain carries: the
    // event's `contentRef` IS the keccak-CID of the published preimage (the
    // publication half lives in `lib/core/witnessContent`), so a reader
    // derives the address from the event alone, verifies the bytes hash back
    // to the fingerprint, and decodes them through the same spec that declared
    // the stage. A party's own private witness resolves from the copy its
    // browser kept (checked against the fingerprint); another party's
    // private, withheld, or erased content resolves absent — the receipt row
    // still renders the fingerprint.
    //
    // Keyed by (clause key, stage, contentRef) — NEVER the fingerprint alone:
    // the same bytes decode differently under different field sets, and two
    // clauses can legitimately fingerprint identical bytes (a ladder event's
    // `(uint8 0, "")` is byte-identical to a witness's first-ordinal enum with
    // an empty companion). One fetch per fingerprint; one decode per triple.
    const [witnessValues, setWitnessValues] = useState<Map<string, Record<string, unknown>>>(new Map());
    useEffect(() => {
        let canceled = false;
        (async () => {
            const next = new Map<string, Record<string, unknown>>();
            const jobs: Promise<void>[] = [];
            const contentByRef = new Map<string, Promise<`0x${string}` | null>>();
            for (const records of attestationsByOrder.values()) {
                for (const att of records) {
                    if (!att.contentRef) continue;
                    // The event carries the clause KEY; spec reads key on it.
                    // Only content encoded over a declared stage set
                    // (`attestationIsWitness`); a ladder event over the
                    // top-level fields is read on the process-log timeline.
                    if (!attestationIsWitness(att.clauseId, att.stage)) continue;
                    const witnessSpec = getClauseSpec(att.clauseId);
                    if (!witnessSpec) continue;
                    const key = `${att.clauseId.toLowerCase()}:${att.stage}:${att.contentRef}`;
                    if (next.has(key)) continue;
                    next.set(key, {}); // claim the triple; overwritten on decode
                    // The copy this browser kept of its own private witness
                    // (keyed by order too), else the public pin.
                    const placeKey = `${att.orderHash.toLowerCase()}:${key}`;
                    let pending = contentByRef.get(placeKey);
                    if (!pending) {
                        pending = resolveHeldWitnessContent(holder, att);
                        contentByRef.set(placeKey, pending);
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
            if (!canceled) setWitnessValues(next);
        })();
        return () => { canceled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attestationsByOrder, clauseSpecsVersion, holder]);

    // Per-order evidence: committed clause data (from the agreement) + the
    // sovereign process-log timelines (from the attestations). Both via the
    // existing generic extractors — no new projection.
    const perOrder = useMemo(() => {
        return orders.map((order) => {
            const agreement = order.checkoutHash ? agreements.get(order.checkoutHash) : undefined;
            const clauseData = agreement ? extractClauseData(order, agreement) : null;
            const processLogs = extractProcessLogs(order, attestationsByOrder.get(order.orderHash) ?? [], heldWitnessReader(holder));
            // An agreement still in flight holds its order's block open, with
            // the loading line in the clauses' place.
            const agreementPending = !!order.checkoutHash && agreementReads.get(order.checkoutHash)?.status === "pending";
            return { order, clauseData, processLogs, agreementPending };
        }).filter(({ clauseData, processLogs, agreementPending }) =>
            agreementPending || (clauseData && clauseData.clauses.length > 0) || processLogs.logs.length > 0,
        );
    }, [orders, agreements, agreementReads, attestationsByOrder, clauseSpecsVersion, holder]);

    // What this evidence lacks, stated beside it, each part once. An agreement
    // still in flight is not listed: its order's loading line stands for it.
    const missing = useMemo(() => {
        const parts: MissingPart[] = [];
        if (attestationsRead.status === "absent") {
            parts.push({ part: "Attestations of this process", reason: "the read of its attestations failed, so none are listed; the process may have attestations" });
        }
        for (const order of orders) {
            const agreement = order.checkoutHash ? agreements.get(order.checkoutHash) : undefined;
            if (!order.checkoutHash) {
                parts.push({
                    part: `Agreement and clauses of order ${order.orderHash}`,
                    orderHash: order.orderHash,
                    reason: "the order carries no checkoutHash, so no agreement was looked up",
                });
            } else if (agreementReads.get(order.checkoutHash)?.status === "absent") {
                parts.push({
                    part: `Agreement and clauses of order ${order.orderHash}`,
                    orderHash: order.orderHash,
                    reason: `the agreement under checkoutHash ${order.checkoutHash} was not loaded`,
                });
            }
            if (agreement) parts.push(...extractClauseData(order, agreement).missing);
            const signatures = signaturesByOrder.get(order.orderHash);
            if (signatures?.status === "absent") {
                parts.push({
                    part: `Signatures of order ${order.orderHash}`,
                    orderHash: order.orderHash,
                    reason: "the read of its commit transaction failed, so neither signature was checked here",
                });
            } else if (signatures?.status === "present" && signatures.value.buyer === "unavailable" && signatures.value.seller === "unavailable") {
                parts.push({
                    part: `Signatures of order ${order.orderHash}`,
                    orderHash: order.orderHash,
                    reason: "no commit calldata readable for this order and no batch that carries it, so neither party's signature was checked here",
                });
            }
            // The same held-content reader the evidence file passes: what
            // this browser holds is shown as held, and only what it does not
            // hold is named missing.
            parts.push(...extractProcessLogs(order, attestationsByOrder.get(order.orderHash) ?? [], heldWitnessReader(holder)).missing);
        }
        return parts;
    }, [orders, agreements, agreementReads, signaturesByOrder, attestationsRead.status, attestationsByOrder, clauseSpecsVersion, holder]);

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
                <p className="text-sm text-ink-body max-w-2xl" data-testid="audit-attestation-note">
                    Every clause field and attested value here is the signing party&apos;s declaration or attestation: the
                    chain fixes what was signed, bound to which order, and when
                    &mdash; never that it is true.
                </p>
            </div>

            <MissingParts missing={missing} />

            {attestationsRead.status === "absent" ? null : attestationsRead.status === "pending" ? (
                <p className="text-sm text-ink-muted">Loading…</p>
            ) : perOrder.length === 0 ? (
                <p className="text-sm text-ink-muted">No clause evidence recorded for this process yet.</p>
            ) : (
                <div className="space-y-8">
                    {perOrder.map(({ order, clauseData, processLogs, agreementPending }) => {
                        const signatures = signaturesByOrder.get(order.orderHash);
                        return (
                        <div key={order.orderHash} className="space-y-5 border border-default rounded-section p-5" data-testid={`audit-order-${order.orderHash}`}>
                            <p className="text-xs font-mono text-ink-muted break-all">order {order.orderHash}</p>
                            <OrderSignatureRows
                                orderHash={order.orderHash}
                                verdicts={signatures?.status === "present" ? signatures.value : undefined}
                            />

                            {agreementPending && (
                                <p className="text-sm text-ink-muted" data-testid={`audit-order-loading-${order.orderHash}`}>Loading…</p>
                            )}

                            {clauseData && clauseData.clauses.length > 0 && (
                                <div className="space-y-4">
                                    {clauseData.clauses.map((clause) => (
                                        <div key={`data-${clause.clauseKey}`} className="space-y-2" data-testid={`audit-clause-${clause.clauseKey}`}>
                                            <h3 className="text-sm font-semibold text-ink-heading">{clause.title}</h3>
                                            {/* A withheld clause's values exist and are not in this
                                                agreement: their place stays empty, and the list of what
                                                the evidence lacks names them. */}
                                            {clause.withheld ? null : clause.fields.length === 0 ? (
                                                <p className="text-sm text-ink-muted">Committed with no field values.</p>
                                            ) : (
                                                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
                                                    {clause.fields.map((field) => (
                                                        <div key={field.name} className="contents">
                                                            <dt className="text-ink-muted">{field.label}</dt>
                                                            <dd className="text-ink-body" data-testid={`audit-field-${clause.clauseKey}-${field.name}`}>
                                                                {field.values.join(", ")}
                                                                <RowBoundary
                                                                    boundary="institution-declared"
                                                                    source="read from the agreement the parties signed"
                                                                />
                                                            </dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            )}
                                            {/* The reader's verification affordance — renders only for a
                                                leaf declaring a register assembly + declared id. */}
                                            <CredentialVerifyButton
                                                data={Object.fromEntries(clause.fields.map((f) => [f.name, f.values[0]]))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {processLogs.logs.map((group) => (
                                <div key={`log-${group.clauseKey}`} className="space-y-2">
                                    <h3 className="text-sm font-semibold text-ink-heading">{group.title}</h3>
                                    <ul className="space-y-1 text-sm">
                                        {group.events.map((event, i) => {
                                            const decoded = witnessValues.get(`${group.clauseKey}:${event.stage}:${event.contentRef}`);
                                            const witness = decoded ? describeWitness(group.clauseKey, event.stage, decoded) : null;
                                            return (
                                                <li key={`${group.clauseKey}-${i}`} className="text-ink-body" data-testid={`audit-log-${group.clauseKey}-${i}`}>
                                                    <div className="flex flex-wrap gap-x-3">
                                                        <span className="text-ink-heading">
                                                            {describeAttestation(group.clauseKey, event.stage).eventLabel}
                                                        </span>
                                                        <span className="text-ink-muted font-mono text-xs break-all">
                                                            {event.attester}
                                                        </span>
                                                        <span className="text-ink-muted text-xs">block {event.blockNumber}</span>
                                                    </div>
                                                    <RowBoundary
                                                        boundary="protocol-derived"
                                                        source={
                                                            witness && witness.fields.length > 0
                                                                ? "derived at read time from the Attestation event; the values below read from the attester's own content"
                                                                : "derived at read time from the Attestation event; no content read"
                                                        }
                                                    />
                                                    {/* The evidence the chain actually carries: a fingerprint of
                                                        what was attested, timestamped and tamper-evident (any
                                                        change to the content changes the fingerprint). The
                                                        content itself is the attester's representation. Anyone
                                                        holding the preimage proves the match off-chain. */}
                                                    <dl
                                                        className="mt-1 ml-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
                                                        data-testid={`audit-content-ref-${group.clauseKey}-${event.stage}`}
                                                    >
                                                        <dt className="text-ink-muted">Content fingerprint</dt>
                                                        <dd className="text-ink-body font-mono break-all">{event.contentRef}</dd>
                                                        {event.universe && (
                                                            <>
                                                                <dt className="text-ink-muted">Path</dt>
                                                                <dd className="text-ink-body" data-testid={`audit-attestation-path-${group.clauseKey}-${event.stage}`} data-universe={event.universe}>
                                                                    {attestationPathLabel(event.universe)}
                                                                </dd>
                                                            </>
                                                        )}
                                                    </dl>
                                                    {/* The values behind the fingerprint, when their publication
                                                        resolves — fetched at the keccak-CID the fingerprint
                                                        derives, verified against it, decoded through the spec's
                                                        declared stage fields. Absent for private-disposition,
                                                        withheld, or erased content. */}
                                                    {witness && witness.fields.length > 0 && (
                                                        <dl
                                                            className="mt-1 ml-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
                                                            data-testid={`audit-witness-${group.clauseKey}-${event.stage}`}
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
                        );
                    })}
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
