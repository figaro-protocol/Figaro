/**
 * fieldFormatInputs — the format→input-component registry.
 *
 * A string field's declared `format` is an OPEN axis (any clause may declare
 * any format; the SDK validates only the formats it knows and treats the rest
 * as plain strings). This registry is the frontend half of that seam: it maps
 * the formats THIS frontend has a richer input for (e.g. `"geohash"` → a
 * device-location-assisted picker) to the component that renders it.
 * `FieldControl` consults it wherever a fillable string renders; a format with
 * no entry falls back to the plain text input — the affordance is progressive
 * enhancement, never a requirement.
 *
 * The discipline (why the lens system and the V4 module packages died, and
 * this doesn't): the KEY is a semantic the clause spec DECLARES, never a
 * clause id, a mechanism kind, or a component name. A never-seen clause
 * declaring `format: "geohash"` gets the picker with zero code changes; a
 * never-seen format degrades to text.
 */
import type { ComponentType } from "react";
import { GeohashFieldInput } from "@/components/core/GeohashFieldInput";

/** The contract a format input satisfies — the same props FieldControl's
 *  plain scalar input serves. */
export interface FieldFormatInputProps {
    value: string;
    onChange: (next: string | undefined) => void;
    testId: string;
    /** The declared pattern, when the spec carries one — inputs may use it
     *  for inline shape feedback. */
    pattern?: string;
}

const REGISTRY = new Map<string, ComponentType<FieldFormatInputProps>>([
    ["geohash", GeohashFieldInput],
]);

/** Register an input component for a declared format. Last write wins —
 *  callers may override a built-in mapping. The registry's extension point:
 *  new tenants register here as new formats gain richer inputs.
 *  @public */
export function registerFieldFormatInput(
    format: string,
    component: ComponentType<FieldFormatInputProps>,
): void {
    REGISTRY.set(format, component);
}

/** The input component this frontend maps to a declared format, or null —
 *  the caller falls back to the plain text input. */
export function getFieldFormatInput(
    format: string | undefined,
): ComponentType<FieldFormatInputProps> | null {
    if (!format) return null;
    return REGISTRY.get(format) ?? null;
}
