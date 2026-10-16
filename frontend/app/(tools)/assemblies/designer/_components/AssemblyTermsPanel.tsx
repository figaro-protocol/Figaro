"use client";

/**
 * AssemblyTermsPanel — the ASSEMBLY-LEVEL composition surface:
 * every registered clause declaring `design.scope: "assembly"`
 * (a term of the composition itself — a denomination pin, a dispute forum),
 * read live from `ClauseRegistry`, a checkbox each, composed ONCE for the
 * whole design. Field editors render exactly for `design.fills` — the same
 * rule as the per-order drawer. The drawer excludes these clauses; this panel
 * offers only these — the two surfaces partition the registry by declared
 * scope, so a duplicate is structurally impossible on this canvas (and
 * `buildAssembly` re-verifies at draft/publish for imported or
 * hand-written compositions).
 *
 * At checkout every assembly-scoped section folds into EVERY agreement, so
 * every party signs it — stated in the panel copy for the designer.
 *
 * Read-only surfaces (the review and `/view`) also pass the composition: its
 * root and, per agreement, the registered agreement it binds — rendered
 * above the terms, since the root is the hash over both.
 *
 * Testids: `assembly-terms-panel`, `assembly-terms-clause-<clauseKey>`,
 * `assembly-terms-field-<clauseKey>-<field>`, `assembly-composition`,
 * `assembly-composition-root`, `assembly-composition-entry-<index>`.
 */

import { useMemo } from "react";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import {
    clauseDesignFills,
    clauseIsAssemblyScoped,
    clauseIsMandatory,
    getClauseSpec,
    isLiveRegistration,
    listKnownClauses,
} from "@/lib/shared/clauseSpecSource";
import { FieldControl } from "@/components/runtime/FieldControl";
import { truncateHex } from "@/lib/shared/formatHex";

/** The composition root and each agreement's agreement key. */
function CompositionAgreements({ composition }: { composition: { compositionHash: `0x${string}`; agreementKeys: readonly `0x${string}`[] } }) {
    return (
        <section data-testid="assembly-composition" className="border border-default rounded bg-paper p-3 space-y-2">
            <p className="text-xs font-semibold text-ink-body">Composition</p>
            <p className="text-xs text-ink-muted leading-relaxed">
                The root is the AssemblyRegistry key: the merkle root over the agreements, each
                binding one registered agreement by its AgreementRegistry key, and the assembly terms.
            </p>
            <p className="font-mono text-[10px] text-ink-body break-all" data-testid="assembly-composition-root" title={composition.compositionHash}>
                {composition.compositionHash}
            </p>
            <ul className="space-y-0.5">
                {composition.agreementKeys.map((agreementKey, index) => (
                    <li
                        key={`${index}-${agreementKey}`}
                        className="text-[11px] text-ink-body"
                        data-testid={`assembly-composition-entry-${index}`}
                        data-agreement-key={agreementKey}
                    >
                        Order {index + 1}:{" "}
                        <span className="font-mono" title={agreementKey}>{truncateHex(agreementKey, { head: 10, tail: 6 })}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function AssemblyTermsPanel({
    values,
    onToggleClause,
    onSetClauseField,
    readOnly = false,
    composition,
}: {
    /** clause key → composed values (design.fills only; `{}` = selected). */
    values: Record<string, Record<string, unknown>>;
    onToggleClause: (clauseKey: string, next: boolean) => void;
    onSetClauseField: (clauseKey: string, field: string, value: unknown) => void;
    readOnly?: boolean;
    /** The composition root and each agreement's agreement key, in
     *  assembly order — shown by the read-only surfaces. */
    composition?: { compositionHash: `0x${string}`; agreementKeys: readonly `0x${string}`[] };
}) {
    const { data: registered } = useAllRegisteredClauses();
    const { version: specsVersion } = useClauseSpecs();

    // Live registry ∩ loaded specs, filtered to assembly scope — derived,
    // never a roster; a never-seen assembly-scoped clause appears here with
    // zero code change. Withdrawn stakes de-surface exactly as in the drawer.
    const assemblyClauses = useMemo(() => {
        const live = new Set(
            (registered ?? []).filter(isLiveRegistration).map((e) => e.clauseKey.toLowerCase()),
        );
        // A mandatory assembly-scoped clause, when the registry holds one,
        // folds in automatically at publish — never a choice, so never
        // offered here.
        return listKnownClauses().filter(
            (c) => live.has(c.clauseKey.toLowerCase())
                && clauseIsAssemblyScoped(c.clauseKey)
                && !clauseIsMandatory(c.clauseKey),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registered, specsVersion]);

    const entries = composition ? <CompositionAgreements composition={composition} /> : null;
    if (assemblyClauses.length === 0) return entries;

    return (
        <>
        {entries}
        <section data-testid="assembly-terms-panel" className="border border-default rounded bg-paper p-3 space-y-2">
            <p className="text-xs font-semibold text-ink-body">Assembly terms</p>
            <p className="text-xs text-ink-muted leading-relaxed">
                Terms of the whole composition — composed once here, carried in the
                assembly&rsquo;s identity, and folded into <strong>every</strong> agreement at
                checkout so every party signs them.
            </p>
            {assemblyClauses.map(({ clauseKey }) => {
                const spec = getClauseSpec(clauseKey);
                if (!spec) return null;
                // A term is one key: checked when the composition holds it.
                const selected = clauseKey in values;
                const fills = clauseDesignFills(clauseKey);
                return (
                    <div key={clauseKey} className="space-y-1.5">
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                data-testid={`assembly-terms-clause-${clauseKey}`}
                                checked={selected}
                                disabled={readOnly}
                                onChange={(e) => onToggleClause(clauseKey, e.target.checked)}
                                className="mt-0.5"
                            />
                            <span className="text-sm text-ink-primary">
                                {spec.title}
                                <span className="ml-1 font-mono text-[10px] text-ink-muted" title={clauseKey}>v{spec.version}</span>
                            </span>
                        </label>
                        {selected && spec.fields
                            .filter((f) => fills.includes(f.name))
                            .map((field) => (
                                <div key={field.name} className="pl-6">
                                    <FieldControl
                                        field={field}
                                        value={values[clauseKey]?.[field.name]}
                                        onChange={(v) => onSetClauseField(clauseKey, field.name, v)}
                                        testId={`assembly-terms-field-${clauseKey}-${field.name}`}
                                    />
                                </div>
                            ))}
                    </div>
                );
            })}
        </section>
        </>
    );
}
