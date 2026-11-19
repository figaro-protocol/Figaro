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
 * The discipline: the KEY is a semantic the clause spec DECLARES, never a
 * clause id, a mechanism kind, or a component name. A never-seen clause
 * declaring `format: "geohash"` gets the picker with zero code changes; a
 * never-seen format degrades to text.
 */
import type { ComponentType } from "react";
import type { FieldSpec, FieldDisposition } from "@figaro-protocol/sdk/clauses";
import { GeohashFieldInput } from "@/components/runtime/GeohashFieldInput";
import { ContentAnchorFieldInput } from "@/components/runtime/ContentAnchorFieldInput";
import { EvidenceCaptureInput } from "@/components/runtime/EvidenceCaptureInput";
import { DatetimeFieldInput } from "@/components/runtime/DatetimeFieldInput";

/** The contract a format input satisfies — the same props FieldControl's
 *  plain scalar input serves. */
export interface FieldFormatInputProps {
    value: string;
    onChange: (next: string | undefined) => void;
    testId: string;
    /** The declared pattern, when the spec carries one — inputs may use it
     *  for inline shape feedback. */
    pattern?: string;
    /** The field's public/private disposition, so an input can apply
     *  disposition-keyed policy (e.g. the geohash grain cap — coarse when
     *  public, fine when private). Absent ⇒ public (the default). */
    disposition?: FieldDisposition;
    /** Companion channel — a format input that DERIVES sibling values reports
     *  them keyed by the SIBLING's declared format (e.g. the content-anchor
     *  input pins the artifact and emits its locator under `"uri"`).
     *  FieldControl's object branch routes each companion to the first
     *  sibling field declaring that format; no field name crosses this seam,
     *  and a companion with no declaring sibling is dropped. Absent outside
     *  an object context. */
    onCompanion?: (format: string, value: string | undefined) => void;
    /** Values the SURROUNDING SURFACE already knows for this format, offered
     *  as one-click fills beside typing (e.g. the checkout offers the seller's
     *  declared locality to every geohash-format field, so a buyer collecting
     *  at the counter states origin and destination without a device read or
     *  a code they do not know). Keyed by format upstream, never by clause or
     *  field name; the input decides how to show them. Absent ⇒ none. */
    presets?: ReadonlyArray<FormatPreset>;
}

/** One value a surface can offer a format input, with the words the party
 *  reads on the affordance. */
export interface FormatPreset {
    label: string;
    value: string;
}

// The tenants. A format gains a richer input in this frontend by an entry
// here; another frontend keeps a registry of its own.
const REGISTRY = new Map<string, ComponentType<FieldFormatInputProps>>([
    ["geohash", GeohashFieldInput],
    // bytes32-hex = a CONTENT ANCHOR (keccak256 of a canonical artifact). The
    // ONLY fill path is affix → pin → hash — pasting raw hex is used nowhere
    // as a content fill, so the anchor input replaces the
    // plain text input for every bytes32-hex content field, including on
    // clauses this codebase has never seen.
    ["bytes32-hex", ContentAnchorFieldInput],
    // evidence-capture = a runtime witness's evidence pointer. The device's
    // OWN capture capabilities (geolocation / NFC / BLE, detected at runtime
    // — browser and mobile, one surface) pin the artifact and fill the URI;
    // manual URI entry stays (the field is an open pointer).
    ["evidence-capture", EvidenceCaptureInput],
    // iso-datetime = an absolute instant (a booked window bound, a reporting
    // period). A native datetime picker storing ISO 8601 UTC, replacing the
    // raw text box for every iso-datetime content field on any clause.
    ["iso-datetime", DatetimeFieldInput],
]);

/** The input component this frontend maps to a declared format, or null —
 *  the caller falls back to the plain text input. */
export function getFieldFormatInput(
    format: string | undefined,
): ComponentType<FieldFormatInputProps> | null {
    if (!format) return null;
    return REGISTRY.get(format) ?? null;
}

/**
 * Whether some SIBLING's input format follows this field's value — i.e. a
 * sibling declares `formatFromField: <this field's name>`. The mirror of
 * `resolveInputFormat` (`@figaro-protocol/sdk/clauses`): the field a sibling reads its format from must be
 * editable by whoever fills that sibling, so a form renders it even when it
 * carries a spec `default` (figaro-geolocation's `geocodeStandard` defaults to
 * `geohash`; a party may choose another of the standards its enum lists, H3,
 * S2 or Open Location Code, and the sibling's input follows that choice).
 * Clause-agnostic: it reads only spec-declared field names.
 */
export function isSiblingFormatSource(
    field: FieldSpec,
    siblings: readonly FieldSpec[],
): boolean {
    return siblings.some((s) => s.type === "string" && s.formatFromField === field.name);
}
