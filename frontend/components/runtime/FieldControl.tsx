/**
 * FieldControl — renders ONE `FieldSpec` as an editable control.
 *
 * Spec-driven and clause-agnostic: it reads the field's `type` and renders the
 * matching control (enum → radios, array-of-enum → checkboxes, boolean →
 * checkbox, object → recursive sub-fields, scalar → text/number input). It knows
 * no clause and no interface — the same renderer drives a clause's content
 * `fields` (design-time, in the AgreementDrawer) and a composition's runtime
 * `block.runtime.fields` (checkout-time, in the runtime-inputs form). One parser
 * (`parseFieldSpec`), one renderer.
 *
 * The one axis that differs between those two uses is the fill-vs-defer policy
 * for scalars, carried by `mode`:
 *
 *   - `"design"` (default) — the AgreementDrawer's policy, FULLY RULED
 *     2026-07-10: a REQUIRED field is a design-time TERM — scalars with no
 *     default fill inline, array-of-object renders its repeater (a consent
 *     clause's affixed documents). OPTIONAL fields are NEVER design-filled,
 *     and there is NO checkout clause-content surface (the old "provided at
 *     checkout" stub pointed at the ripped-out beta-tester consent ceremony —
 *     legacy, deleted): a value not filled here comes from its PRODUCING
 *     surface (catalogue fold, derivation, spec default, companion routing)
 *     or stays absent.
 *   - `"runtime"` — the composition form's policy: every scalar (string / integer
 *     / bigint) is an input the party fills NOW. Nothing defers — these fields ARE
 *     the runtime input.
 *
 * enum / array-of-enum / boolean / object render identically in both modes.
 */

import { useRef } from "react";
import type { FieldSpec } from "@figaro/sdk/clauses";
import { safeRegexTest } from "@figaro/sdk/clauses";
import { getFieldFormatInput } from "@/components/runtime/fieldFormatInputs";

export type FieldControlMode = "design" | "runtime";

/** The child-field editor an OBJECT value shares between the object branch
 *  and the repeater's items. Patches go through a latest-value ref so two
 *  SYNCHRONOUS patches COMPOSE — the content-anchor input emits its own value
 *  AND a companion (the pinned locator) in one tick; computing both from the
 *  same stale render closure would drop the first. Companion routing lives
 *  here: a derived value lands on the first sibling declaring its format. */
function ObjectEntryFields({
    fields,
    value,
    onValue,
    testIdBase,
    mode,
}: {
    fields: readonly FieldSpec[];
    value: Record<string, unknown>;
    onValue: (next: Record<string, unknown>) => void;
    testIdBase: string;
    mode: FieldControlMode;
}) {
    const latest = useRef(value);
    latest.current = value;
    const patch = (name: string, next: unknown) => {
        const nextObj = { ...latest.current };
        if (next === undefined) delete nextObj[name];
        else nextObj[name] = next;
        latest.current = nextObj;
        onValue(nextObj);
    };
    return (
        <>
            {fields.map((child) => (
                <FieldControl
                    key={child.name}
                    field={child}
                    value={value[child.name]}
                    onChange={(next) => patch(child.name, next)}
                    onCompanion={(format, next) => {
                        const sibling = fields.find((f) => f.type === "string" && f.format === format);
                        if (sibling) patch(sibling.name, next);
                    }}
                    testId={`${testIdBase}-${child.name}`}
                    mode={mode}
                />
            ))}
        </>
    );
}

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
        // ReDoS-safe: `field.pattern` is attacker-authored (permissionless clause
        // spec), and this runs on every keystroke — a catastrophic pattern would
        // hang the tab. `safeRegexTest` screens the exponential shape and bounds
        // the input, treating an unsafe/invalid pattern as satisfied (finding 5).
        if (!safeRegexTest(field.pattern, raw)) {
            return `Doesn't match the spec's required format (${field.pattern}).`;
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
    onCompanion,
    resolvedFormat,
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
    /** Companion routing (object contexts only): a format input that derives
     *  a SIBLING's value emits it keyed by the sibling's declared format —
     *  the enclosing object/repeater branch patches the first sibling field
     *  declaring that format. See `FieldFormatInputProps.onCompanion`. */
    onCompanion?: (format: string, next: string | undefined) => void;
    /** The VALUE-DRIVEN input format, when a field-list renderer resolved one
     *  from a sibling value (see `resolveInputFormat`). Overrides the field's
     *  static `format` for input dispatch only. Absent ⇒ the static `format`. */
    resolvedFormat?: string;
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

    // array-of-object → REPEATER. The spec models a LIST of structured entries
    // (a consent clause's affixed documents); each item renders its child
    // fields recursively — one parser, one renderer, no per-clause shape.
    // Fill-vs-defer follows the scalar rule: a REQUIRED object-array is a
    // design-time term (fixed content is what makes the composition
    // content-addressed — ruled 2026-07-10, partially settling the
    // design-fill fork, since closed in full); an optional one stays unset. Runtime
    // mode always fills. Companion routing is per ITEM: a format input that
    // derives a sibling value (the content-anchor input pinning an artifact
    // and emitting its locator) patches the first sibling field in the SAME
    // item declaring that format.
    if (field.type === "array" && field.items.type === "object"
        && (mode === "runtime" || field.required)) {
        const items = field.items;
        const arr = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
        return (
            <div data-testid={`${testId}-group`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-2">
                    {arr.map((item, i) => (
                        <div
                            key={i}
                            className="space-y-2 rounded border border-neutral-200 p-2"
                            data-testid={`${testId}-item-${i}`}
                        >
                            <ObjectEntryFields
                                fields={items.fields}
                                value={item}
                                onValue={(nextItem) => onChange(arr.map((it, j) => (j === i ? nextItem : it)))}
                                testIdBase={`${testId}-${i}`}
                                // An authored entry is authored WHOLE: its
                                // children never defer (the item exists
                                // because the designer is filling it now).
                                mode="runtime"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => onChange(arr.filter((_item, j) => j !== i))}
                                    data-testid={`${testId}-item-${i}-remove`}
                                    className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange([...arr, {}])}
                        data-testid={`${testId}-add`}
                        className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                    >
                        Add {field.name} entry
                    </button>
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
                    <ObjectEntryFields
                        fields={field.fields}
                        value={obj}
                        onValue={(nextObj) => onChange(Object.keys(nextObj).length ? nextObj : undefined)}
                        testIdBase={testId}
                        mode={mode}
                    />
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
            // Value-driven format (resolvedFormat) wins over the static one —
            // e.g. geolocation's origin/destination follow the committed
            // geocodeStandard. Absent ⇒ the field's own declared format.
            const FormatInput = getFieldFormatInput(resolvedFormat ?? field.format);
            if (FormatInput) {
                return (
                    <div data-testid={`${testId}-field`}>
                        {label && <div className="mb-1">{label}</div>}
                        <FormatInput
                            value={current}
                            onChange={(next) => onChange(next)}
                            testId={testId}
                            pattern={field.pattern}
                            disposition={field.disposition}
                            onCompanion={onCompanion}
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

    // Everything else is OPTIONAL structured content with no design fill —
    // ruled 2026-07-10: no checkout clause-content surface exists (the old
    // "provided at checkout" promise was legacy from the ripped-out
    // beta-tester consent ceremony). The value comes from its PRODUCING
    // surface (catalogue fold, derivation, spec default, companion routing)
    // or stays absent — absence of an optional field is a valid committed
    // state, not a gap.
    return (
        <div className="text-xs text-ink-faint italic" data-testid={`${testId}-deferred`}>
            {field.name} — optional; filled by its producing surface or left unset
        </div>
    );
}
