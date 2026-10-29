"use client";

/**
 * StageAttestationComparison — on the process view, whether the parties'
 * attestations under one stage agree, field by field, and which party filed
 * what.
 *
 * NAMES NO CLAUSE. A (clause, stage) takes part when the clause's own spec
 * declares it assembly-scoped (`block.design.scope: "assembly"`, so every
 * party of the process signed it) and declares the stage a witness stage
 * (`spec.stages[N]`, so the filing carries content). Every filing is compared —
 * the latest per attester per order — and each row names its party and order. The comparison is
 * derived at read time (`lib/composition/stageAttestationComparison`) from
 * the process's attestation log and the content each fingerprint resolves to
 * — the same read path the audit's clause evidence uses: `fetchWitnessContent`
 * derives the keccak-CID from the event's `contentRef`, verifies the bytes hash
 * back to it, and `decodeContentFromSpec` decodes them through the stage's
 * declared fields. Content that does not resolve (private disposition,
 * withheld, erased) compares nothing. Nothing is stored.
 */

import { useEffect, useMemo, useState } from "react";
import { decodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import { fetchWitnessContent } from "@/lib/composition/witnessContent";
import {
    compareStageContent,
    groupAttestationsByStage,
    type StageComparison,
} from "@/lib/composition/stageAttestationComparison";
import { clauseIsAssemblyScoped, describeWitness, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { truncateHex } from "@/lib/shared/formatHex";

interface Props {
    attestations: readonly RuntimeAttestation[];
}

/** The content key: the same bytes decode differently under different field
 *  sets, so a decode is keyed by (clause, stage, fingerprint). */
const contentKey = (att: RuntimeAttestation) => `${att.clauseId.toLowerCase()}:${att.stage}:${att.contentRef.toLowerCase()}`;

/** Shorten every long hex token in a rendered value (hashes, wallets). */
const shortenHex = (value: string) =>
    value.replace(/0x[0-9a-fA-F]{16,}/gu, (hex) => truncateHex(hex, { head: 8, tail: 6 }));

/** True for a declared witness stage of an assembly-scoped clause — read from
 *  the clause's own spec. */
function takesPart(clauseKey: string, stage: number): boolean {
    return clauseIsAssemblyScoped(clauseKey) && getClauseSpec(clauseKey)?.stages?.[stage] !== undefined;
}

function verdictText(comparison: StageComparison, labelOf: (name: string) => string): string {
    switch (comparison.kind) {
        case "agree": return "agree";
        case "differ": return `differ on: ${comparison.fields.map(labelOf).join(", ")}`;
        case "one-party": return "one party only";
        case "unavailable": return "content not available";
    }
}

export function StageAttestationComparison({ attestations }: Props) {
    const { version: clauseSpecsVersion } = useClauseSpecs();

    const groups = useMemo(
        () => groupAttestationsByStage(attestations, takesPart),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [attestations, clauseSpecsVersion],
    );

    // Decoded content by content key: the decoded fields once read, null once it is
    // known not to resolve; absent while the read is in flight.
    const [contents, setContents] = useState<Map<string, Record<string, unknown> | null>>(new Map());
    useEffect(() => {
        let canceled = false;
        (async () => {
            const next = new Map<string, Record<string, unknown> | null>();
            await Promise.all(groups.flatMap((group) => group.filings).map(async (att) => {
                const key = contentKey(att);
                if (next.has(key)) return;
                next.set(key, null);
                const spec = getClauseSpec(att.clauseId);
                const content = spec ? await fetchWitnessContent(att.contentRef) : null;
                if (!spec || !content) return;
                try {
                    next.set(key, decodeContentFromSpec(spec, content, { stage: att.stage }));
                } catch {
                    // Bytes that do not decode under the declared fields read as not available.
                }
            }));
            if (!canceled) setContents(next);
        })();
        return () => { canceled = true; };
    }, [groups]);

    if (groups.length === 0) return null;

    return (
        <section className="space-y-3" data-testid="stage-attestation-comparison">
            <p className="text-xs font-semibold text-ink-muted">Attestations compared</p>
            <p className="text-xs text-ink-body">
                Where a term every party signed has a stage each party attests, the filings are compared field by
                field. A match says the parties filed the same values; the chain fixes what each party attested and
                when, never that it is true.
            </p>
            {groups.map((group) => {
                const spec = getClauseSpec(group.clauseKey);
                const fields = spec?.stages?.[group.stage] ?? [];
                const labelOf = (name: string) => fields.find((f) => f.name === name)?.label ?? name;
                const loaded = group.filings.every((att) => contents.has(contentKey(att)));
                const comparison = loaded
                    ? compareStageContent(fields, group.filings.map((att) => ({ attester: att.attester, content: contents.get(contentKey(att)) ?? null })))
                    : null;
                const differing = new Set(comparison?.kind === "differ" ? comparison.fields : []);
                const groupId = `${group.clauseKey.toLowerCase()}-${group.stage}`;
                return (
                    <div
                        key={groupId}
                        className="rounded-tile border border-default bg-paper p-3 space-y-2"
                        data-testid={`stage-comparison-${groupId}`}
                    >
                        <div className="flex flex-wrap items-baseline gap-x-3">
                            <p className="text-sm font-semibold text-ink-primary">
                                {spec?.title ?? truncateHex(group.clauseKey, { head: 10, tail: 0 })}
                            </p>
                            <p className="text-xs text-ink-muted">stage {group.stage}</p>
                            <p
                                className={comparison?.kind === "differ" ? "text-sm font-medium text-warning-fg" : "text-sm font-medium text-ink-body"}
                                data-testid="stage-comparison-verdict"
                                data-verdict={comparison?.kind ?? "loading"}
                            >
                                {comparison ? verdictText(comparison, labelOf) : "reading content…"}
                            </p>
                        </div>
                        <ul className="space-y-2">
                            {group.filings.map((att) => {
                                const content = contents.get(contentKey(att));
                                const witness = content ? describeWitness(group.clauseKey, group.stage, content) : null;
                                return (
                                    <li
                                        key={`${att.attester.toLowerCase()}-${att.orderHash.toLowerCase()}`}
                                        data-testid={`stage-filing-${att.attester.toLowerCase()}-${att.orderHash.toLowerCase()}`}
                                    >
                                        <p className="text-xs text-ink-muted">
                                            <span className="font-mono text-ink-body" title={att.attester}>
                                                {truncateHex(att.attester)}
                                            </span>
                                            {" · order "}
                                            <span className="font-mono" title={att.orderHash}>
                                                {truncateHex(att.orderHash)}
                                            </span>
                                            {" · block "}{att.blockNumber}
                                        </p>
                                        {loaded && !content && (
                                            <p className="ml-4 text-xs text-ink-muted">content not available</p>
                                        )}
                                        {witness && witness.fields.length > 0 && (
                                            <dl className="mt-1 ml-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs">
                                                {witness.fields.map((field) => (
                                                    <div key={field.name} className="contents" data-field={field.name}>
                                                        <dt className={differing.has(field.name) ? "text-warning-fg" : "text-ink-muted"}>
                                                            {field.label}
                                                        </dt>
                                                        <dd className="text-ink-body break-all">
                                                            {field.values.map(shortenHex).join(", ")}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
        </section>
    );
}
