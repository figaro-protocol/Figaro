"use client";

/**
 * ProfileClauseValues — the seller-profile authoring section for
 * PROFILE-authored clause values (seller master data: dimweight's divisor, a
 * declared credential id). The seller-level sibling of the catalogue item's
 * clause-values editor (`OnboardingCatalogueForm`): one spec-driven group per
 * clause declaring `block.checkout.profileFills`, derived live from the
 * registry, never hardcoded — restricted to each spec's DECLARED
 * profile-authored field subset (`clauseProfileFills`; the rest belong to
 * designer fills or checkout derivation). Optional throughout: a seller
 * authors what applies and leaves the rest blank.
 *
 * Testids: `profile-clause-<clauseId>-<field>[-<option>]`.
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
}: {
    values: ProfileClauseValuesMap;
    onChange: (next: ProfileClauseValuesMap) => void;
}) {
    // Warm the chain→IPFS spec cache at this surface's boundary; `version`
    // bumps as specs land and re-renders the section (same pattern as the
    // catalogue clause-values editor).
    useClauseSpecs();
    const profileClauses = listProfileSourcedClauses();
    if (profileClauses.length === 0) return null;
    return (
        <div className="space-y-4 border-t border-neutral-200 pt-3" data-testid="profile-clauses">
            <p className="text-xs text-ink-muted">
                Standing declarations (optional — master data any order composing the
                matching clause fills from your profile)
            </p>
            {profileClauses.map(({ clauseId }) => {
                const spec = getClauseSpec(clauseId);
                if (!spec) return null;
                const authorable = clauseProfileFills(clauseId);
                const fields = spec.fields.filter((f) => authorable.includes(f.name));
                if (fields.length === 0) return null;
                const data = values[clauseId] ?? {};
                const setField = (fieldName: string, next: unknown) => {
                    const nextData = { ...data };
                    if (next === undefined || next === "") delete nextData[fieldName];
                    else nextData[fieldName] = next;
                    const nextMap = { ...values };
                    if (Object.keys(nextData).length) nextMap[clauseId] = nextData;
                    else delete nextMap[clauseId];
                    onChange(nextMap);
                };
                return (
                    <div key={clauseId} className="space-y-2" data-testid={`profile-clause-${clauseId}`}>
                        <p className="text-xs font-medium text-ink-body">{spec.title}</p>
                        {fields.map((field) => (
                            <FieldControl
                                key={field.name}
                                field={field}
                                value={data[field.name]}
                                mode="runtime"
                                testId={`profile-clause-${clauseId}-${field.name}`}
                                onChange={(next) => setField(field.name, next)}
                            />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
