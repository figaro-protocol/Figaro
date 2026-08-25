"use client";

/**
 * AssemblyTermsPanel — the ASSEMBLY-LEVEL composition surface (ruled
 * 2026-07-28): every registered clause declaring `design.scope: "assembly"`
 * (a term of the composition itself — a denomination pin, a dispute forum),
 * read live from `ClauseRegistry`, a checkbox each, composed ONCE for the
 * whole design. Field editors render exactly for `design.fills` — the same
 * rule as the per-order drawer. The drawer excludes these clauses; this panel
 * offers only these — the two surfaces partition the registry by declared
 * scope, so a duplicate is structurally impossible on this canvas (and
 * `buildAssemblyTemplate` re-verifies at draft/publish for imported or
 * hand-authored compositions).
 *
 * At checkout every assembly-scoped section folds into EVERY agreement, so
 * every party signs it — stated in the panel copy for the designer.
 *
 * Testids: `assembly-terms-panel`, `assembly-terms-clause-<clauseId>`,
 * `assembly-terms-field-<clauseId>-<field>`.
 */

import { useMemo } from "react";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import {
    clauseDesignFills,
    clauseIsAssemblyScoped,
    clauseIsMandatory,
    getClauseSpec,
    listKnownClauses,
} from "@/lib/shared/clauseSpecSource";
import { FieldControl } from "@/components/runtime/FieldControl";

export function AssemblyTermsPanel({
    values,
    onToggleClause,
    onSetClauseField,
    readOnly = false,
}: {
    /** clauseId → composed values (design.fills only; `{}` = selected). */
    values: Record<string, Record<string, unknown>>;
    onToggleClause: (clauseId: string, next: boolean, version?: number) => void;
    onSetClauseField: (clauseId: string, field: string, value: unknown) => void;
    readOnly?: boolean;
}) {
    const { data: registered } = useAllRegisteredClauses();
    const { version: specsVersion } = useClauseSpecs();

    // Live registry ∩ loaded specs, filtered to assembly scope — derived,
    // never a roster; a never-seen assembly-scoped clause appears here with
    // zero code change. Withdrawn stakes de-surface exactly as in the drawer.
    const assemblyClauses = useMemo(() => {
        const live = new Set(
            (registered ?? []).filter((e) => !e.stakeWithdrawn).map((e) => `${e.clauseId}#${e.version}`),
        );
        // Mandatory assembly-scoped clauses (assembly-provenance) fold in
        // automatically at publish — never a choice, so never offered here.
        return listKnownClauses().filter(
            (c) => live.has(`${c.clauseId}#${c.version}`)
                && clauseIsAssemblyScoped(c.clauseId, c.version)
                && !clauseIsMandatory(c.clauseId, c.version),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registered, specsVersion]);

    if (assemblyClauses.length === 0) return null;

    return (
        <section data-testid="assembly-terms-panel" className="border border-default rounded bg-paper p-3 space-y-2">
            <p className="text-xs font-semibold text-ink-body">Assembly terms</p>
            <p className="text-xs text-ink-muted leading-relaxed">
                Terms of the whole composition — composed once here, carried in the
                assembly&rsquo;s identity, and folded into <strong>every</strong> agreement at
                checkout so every party signs them.
            </p>
            {assemblyClauses.map(({ clauseId, version }) => {
                const spec = getClauseSpec(clauseId, version);
                if (!spec) return null;
                const selected = clauseId in values;
                const fills = clauseDesignFills(clauseId, version);
                return (
                    <div key={`${clauseId}#${version}`} className="space-y-1.5">
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                data-testid={`assembly-terms-clause-${clauseId}`}
                                checked={selected}
                                disabled={readOnly}
                                onChange={(e) => onToggleClause(clauseId, e.target.checked, version)}
                                className="mt-0.5"
                            />
                            <span className="text-sm text-ink-primary">{spec.title}</span>
                        </label>
                        {selected && spec.fields
                            .filter((f) => fills.includes(f.name))
                            .map((field) => (
                                <div key={field.name} className="pl-6">
                                    <FieldControl
                                        field={field}
                                        value={values[clauseId]?.[field.name]}
                                        onChange={(v) => onSetClauseField(clauseId, field.name, v)}
                                        testId={`assembly-terms-field-${clauseId}-${field.name}`}
                                    />
                                </div>
                            ))}
                    </div>
                );
            })}
        </section>
    );
}
