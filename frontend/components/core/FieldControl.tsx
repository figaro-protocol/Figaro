/**
 * FieldControl — renders ONE `FieldSpec` as an editable control.
 *
 * Spec-driven and clause-agnostic: it reads the field's `type` and renders the
 * matching control (enum → radios, array-of-enum → checkboxes, boolean →
 * checkbox, object → recursive sub-fields, scalar → text/number input). It knows
 * no clause and no interface — the same renderer drives a clause's content
 * `fields` (design-time, in the AgreementDrawer) and a composition's runtime
 * `block.fields` (checkout-time, in the runtime-inputs form). One parser
 * (`parseFieldSpec`), one renderer.
 *
 * The one axis that differs between those two uses is the fill-vs-defer policy
 * for scalars, carried by `mode`:
 *
 *   - `"design"` (default) — the AgreementDrawer's policy: only a REQUIRED scalar
 *     with NO default is captured here (a design-time commitment the agreement
 *     build would otherwise drop); everything else defers to checkout ("provided
 *     at checkout"). Preserves the drawer's exact prior behavior.
 *   - `"runtime"` — the composition form's policy: every scalar (string / integer
 *     / bigint) is an input the party fills NOW. Nothing defers — these fields ARE
 *     the runtime input.
 *
 * enum / array-of-enum / boolean / object render identically in both modes.
 */

import type { FieldSpec } from "@figaro/core/clauses";
import { getFieldFormatInput } from "@/components/core/fieldFormatInputs";

export type FieldControlMode = "design" | "runtime";

/** Spec-declared string constraints (pattern / minLength / maxLength), checked
 *  as the party types — display-only guidance so a violation surfaces at the
 *  keyboard, not first at the checkout sign gate. Enforcement stays Layer A. */
function scalarConstraintIssue(field: FieldSpec, raw: string): string | null {
    if (field.type !== "string" || raw === "") return null;
    if (field.minLength !== undefined && raw.length < field.minLength) {
        return `Must be at least ${field.minLength} characters.`;
    }
    if (field.maxLength !== undefined && raw.length > field.maxLength) {
        return `Must be at most ${field.maxLength} characters.`;
    }
    if (field.pattern) {
        try {
            if (!new RegExp(field.pattern).test(raw)) {
                return `Doesn't match the spec's required format (${field.pattern}).`;
            }
        } catch {
            // An unparseable spec pattern is the validator's finding, not the input's.
        }
    }
    return null;
}

export function FieldControl({
    field,
    value,
    onChange,
    testId,
    hideLabel = false,
    mode = "design",
}: {
    field: FieldSpec;
    value: unknown;
    onChange: (next: unknown) => void;
    testId: string;
    /** Suppress the field's own name label when it duplicates a parent title
     *  (e.g. the `modality` field inside the "Modalities" clause). */
    hideLabel?: boolean;
    /** Fill-vs-defer policy for scalar fields — see the file header. */
    mode?: FieldControlMode;
}) {
    const label = hideLabel ? null : (
        <span
            className={`text-xs text-ink-muted${field.description ? " cursor-help" : ""}`}
            title={field.description}
        >
            {field.name}
        </span>
    );

    if (field.type === "enum") {
        const selected = typeof value === "string" ? value : undefined;
        return (
            <div data-testid={`${testId}-group`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-1">
                    {field.values.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                            <input
                                type="radio"
                                name={testId}
                                checked={selected === opt}
                                onChange={() => onChange(opt)}
                                data-testid={`${testId}-${opt}`}
                                className="accent-accent"
                            />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    // array-of-enum → MULTI-select. The spec models a SET (the values a merchant
    // OFFERS — proximity bands, hand-off locations),
    // narrowed to one at checkout by the party that fills it. Design-time
    // composition declares the whole set; stored as the array the field expects.
    if (field.type === "array" && field.items.type === "enum") {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        const options = field.items.values;
        return (
            <div data-testid={`${testId}-group`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-1">
                    {options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={arr.includes(opt)}
                                onChange={() =>
                                    onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt])
                                }
                                data-testid={`${testId}-${opt}`}
                                className="accent-accent"
                            />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    if (field.type === "boolean") {
        return (
            <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => onChange(e.target.checked ? true : undefined)}
                    data-testid={testId}
                    className="accent-accent"
                />
                <span>{field.name}</span>
            </label>
        );
    }

    // An object field is a sub-clause: render its child fields recursively,
    // reading the tree from the spec (never hardcoded). This is how delivery's
    // coordination + handoff sub-clauses, and handoff's proximity, surface.
    if (field.type === "object") {
        const obj =
            value && typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
        return (
            <div data-testid={`${testId}-object`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-2 border-l border-neutral-200 pl-3">
                    {field.fields.map((child) => (
                        <FieldControl
                            key={child.name}
                            field={child}
                            value={obj[child.name]}
                            onChange={(next) => {
                                const nextObj = { ...obj };
                                if (next === undefined) delete nextObj[child.name];
                                else nextObj[child.name] = next;
                                onChange(Object.keys(nextObj).length ? nextObj : undefined);
                            }}
                            testId={`${testId}-${child.name}`}
                            mode={mode}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // Scalar fill-vs-defer, by mode. In "runtime" every scalar (string / integer
    // / bigint) is filled now — these fields ARE the runtime input. In "design"
    // only a REQUIRED scalar with NO default is captured (a commitment the
    // agreement build would otherwise drop; string → text, integer → number);
    // bigint and everything optional/defaulted defers to checkout below. bigint
    // uses a text input either way — its value is a decimal string (precision the
    // number input would lose).
    const isScalar = field.type === "string" || field.type === "integer" || field.type === "bigint";
    const fillHere = mode === "runtime"
        ? isScalar
        : (field.type === "string" || field.type === "integer")
            && field.required && field.default === undefined;
    if (isScalar && fillHere) {
        const numeric = field.type === "integer";
        const current = value === undefined || value === null ? "" : String(value);
        const issue = scalarConstraintIssue(field, current);
        // The spec's own guidance, visible at the authoring moment (design
        // mode); constraint violations surface as the party types, in BOTH
        // modes. Display-only — the Layer-A sign gate stays the enforcement.
        const guidance = (
            <>
                {issue && (
                    <p className="mt-1 text-xs text-red-600" role="alert" data-testid={`${testId}-constraint`}>
                        {issue}
                    </p>
                )}
                {mode === "design" && field.description && (
                    <p className="mt-1 text-xs text-ink-faint">{field.description}</p>
                )}
            </>
        );
        // A string field's declared `format` may map to a richer input this
        // frontend registered (e.g. "geohash" → device-location picker) — the
        // open format axis. No mapping ⇒ the plain input below; the affordance
        // is progressive enhancement, never a requirement.
        if (field.type === "string") {
            const FormatInput = getFieldFormatInput(field.format);
            if (FormatInput) {
                return (
                    <div data-testid={`${testId}-field`}>
                        {label && <div className="mb-1">{label}</div>}
                        <FormatInput
                            value={current}
                            onChange={(next) => onChange(next)}
                            testId={testId}
                            pattern={field.pattern}
                        />
                        {guidance}
                    </div>
                );
            }
        }
        return (
            <div data-testid={`${testId}-field`}>
                {label && <div className="mb-1">{label}</div>}
                <input
                    type={numeric ? "number" : "text"}
                    value={current}
                    onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") onChange(undefined);
                        else onChange(numeric ? Number(raw) : raw);
                    }}
                    data-testid={testId}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {guidance}
            </div>
        );
    }

    // Everything else is a free-form / structured value, not a bounded design
    // choice (e.g. array-of-object commerce line-items). The designer does NOT
    // type it here — a fill-in field is exactly what turns the template into a
    // checkout hash. It's captured downstream by a mounted component at
    // checkout/runtime. Surface it as deferred, not fillable.
    return (
        <div className="text-xs text-ink-faint italic" data-testid={`${testId}-deferred`}>
            {field.name} — provided at checkout
        </div>
    );
}
