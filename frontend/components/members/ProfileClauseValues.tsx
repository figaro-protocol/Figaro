"use client";

/**
 * ProfileClauseValues — the member-profile authoring section for
 * PROFILE-filled clause values (the member's master data: dimweight's divisor, a
 * declared credential id). The profile-level sibling of the catalog item's
 * clause-values editor (`OnboardingCatalogForm`): one spec-driven group per
 * clause declaring `block.checkout.profileFills`, derived live from the
 * registry, never hardcoded — restricted to each spec's DECLARED
 * profile-filled field subset (`clauseProfileFills`; the rest belong to
 * designer fills or checkout derivation). Optional throughout: a member
 * authors what applies and leaves the rest blank, so a field's checkout
 * `required` never marks it here. Scoped by `clauseKeys` to the clauses the
 * member's bound assemblies compose — the same derivation the catalog
 * step makes — so a member is asked only what its own assemblies read.
 *
 * Testids: `profile-clause-<clauseKey>-<field>[-<option>]`.
 */

import { FieldControl } from "@/components/runtime/FieldControl";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import {
    clauseProfileFills,
    getClauseSpec,
    listProfileSourcedClauses,
} from "@/lib/shared/clauseSpecSource";

export type ProfileClauseValuesMap = Record<string, Record<string, unknown>>;

export function ProfileClauseValues({
    values,
    onChange,
    clauseKeys,
}: {
    values: ProfileClauseValuesMap;
    onChange: (next: ProfileClauseValuesMap) => void;
    /** The clauses the member's bound assemblies compose; only their
     *  profile-filled fields render. Absent = every registered clause. */
    clauseKeys?: readonly string[];
}) {
    // Warm the chain→IPFS spec cache at this surface's boundary; `version`
    // bumps as specs land and re-renders the section (same pattern as the
    // catalog clause-values editor).
    useClauseSpecs();
    const scope = clauseKeys ? new Set(clauseKeys.map((k) => k.toLowerCase())) : null;
    const profileClauses = listProfileSourcedClauses().filter((c) => !scope || scope.has(c.clauseKey.toLowerCase()));
    if (profileClauses.length === 0) return null;
    return (
        <div className="space-y-4 border-t border-default pt-3" data-testid="profile-clauses">
            <p className="text-xs text-ink-muted">
                Standing declarations (optional — master data the assemblies you bound
                read from your profile at checkout)
            </p>
            {profileClauses.map(({ clauseKey }) => {
                const spec = getClauseSpec(clauseKey);
                if (!spec) return null;
                const authorable = clauseProfileFills(clauseKey);
                const fields = spec.fields.filter((f) => authorable.includes(f.name));
                if (fields.length === 0) return null;
                const data = values[clauseKey] ?? {};
                const setField = (fieldName: string, next: unknown) => {
                    const nextData = { ...data };
                    if (next === undefined || next === "") delete nextData[fieldName];
                    else nextData[fieldName] = next;
                    const nextMap = { ...values };
                    if (Object.keys(nextData).length) nextMap[clauseKey] = nextData;
                    else delete nextMap[clauseKey];
                    onChange(nextMap);
                };
                return (
                    <div key={clauseKey} className="space-y-2" data-testid={`profile-clause-${clauseKey}`}>
                        <p className="text-xs font-medium text-ink-body">{spec.title}</p>
                        {fields.map((field) => (
                            <FieldControl
                                key={field.name}
                                field={{ ...field, required: false }}
                                value={data[field.name]}
                                mode="runtime"
                                testId={`profile-clause-${clauseKey}-${field.name}`}
                                onChange={(next) => setField(field.name, next)}
                            />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
