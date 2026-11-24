/**
 * Content validator — validates a content value against a parsed ClauseSpec.
 *
 * Call sites: frontend form gates, SDK agent-action preflight. This is the
 * sign gate of this project's tools. It applies the rules of the published
 * clause format (`clause-spec.schema.json`): the spec format's (the
 * disposition, `formatFromField`, the private set's blinding field and its
 * one shape, the enum's 256 values) and content validation's (the grain cap
 * of geohash, H3, S2 and Open Location Code by disposition, `validateGrain`,
 * here, among them). Its verdicts are pinned case by case in
 * `tests/clauses/engineVectors.test.ts`, and `tests/clauses/clauseFuzz.test.ts`
 * runs it on generated specs and content.
 *
 * Neither path validates content shape on-chain or in the proof program: the
 * coordinator, and the proof program on the batch path, merkle-bind an
 * attestation to its signed agreement and carry the evidence's fingerprint.
 * Well-formedness is this layer's job and a reader's check against the spec
 * the clause key names. There are no per-clause validator contracts,
 * permanently.
 */

import type {
    ClauseSpec,
    FieldSpec,
    StringFieldSpec,
    IntegerFieldSpec,
    BigintFieldSpec,
    EnumFieldSpec,
    ArrayFieldSpec,
    ObjectFieldSpec,
    FieldDisposition,
} from "./spec.js";
import { hasLoneSurrogate, ownValue, resolveFormatWith, resolveInputFormat, siblingDefaults } from "./spec.js";
import { contentFieldsFor } from "./encode.js";
import {
    MAX_CONTENT_PATTERN_WORK,
    isPrintableAscii,
    isRunnablePattern,
    patternWorkExceeded,
    portablePatternSize,
    safeRegexTest,
} from "./safeRegex.js";
import { GEOHASH_FORMAT, capOfDisposition, grainCapOf, grainOf } from "./grain.js";
import { isBytes32Hex, isAddressHex } from "../types.js";

export interface ValidationError {
    /** JSON-pointer-style path to the problem. */
    path: string;
    message: string;
}

export type ValidationResult =
    | { ok: true }
    | { ok: false; errors: ValidationError[] };

export interface ValidateOptions {
    /** If set and the spec has a matching `stages[stage]`, use those fields. */
    stage?: number;
}

const BYTES_HEX_RE = /^0x([0-9a-fA-F]{2})*$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
/** The bigint grammar: a plain decimal integer, optionally negative.
 *  Deliberately TIGHTER than bare `BigInt()` (which coerces `""`, `"0x10"`,
 *  and padded whitespace) — the published format's contract is "decimal
 *  string" (`clause-spec.schema.json`, a field's `type`), so a reader's tool
 *  in any language applies the same grammar. */
const DECIMAL_BIGINT_RE = /^-?[0-9]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The pattern work one content has spent: the sum, over every value a
 * pattern is run on, of the value's length in UTF-16 units times the
 * pattern's expanded size. Values are visited in one order: a spec's fields
 * in the order it declares them, an array's items by index, depth first.
 * When the next value would take the total past MAX_CONTENT_PATTERN_WORK,
 * the content is refused once, at `$`, and no further pattern runs. The
 * total bounds the sign gate's own work on one content, whatever spec it is
 * handed; the published format states the same limit (`pattern`).
 */
interface PatternWork {
    total: number;
    refused: boolean;
}

const CONTENT_WORK_REFUSAL = "content too long for its patterns";

function validateString(
    value: unknown,
    spec: StringFieldSpec,
    path: string,
    errors: ValidationError[],
    work: PatternWork,
): void {
    if (typeof value !== "string") {
        errors.push({ path, message: `expected string, got ${typeof value}` });
        return;
    }
    // JSON.parse keeps a lone UTF-16 surrogate (`"\ud800"`); a strict JSON
    // reader in another language (Rust's serde_json, for one) refuses it.
    // The published format refuses it too (`clause-spec.schema.json`, a
    // field's `type`), so no party signs content such a reader cannot read.
    if (hasLoneSurrogate(value)) {
        errors.push({ path, message: "string holds a lone UTF-16 surrogate" });
        return;
    }
    if (spec.minLength !== undefined && value.length < spec.minLength) {
        errors.push({ path, message: `string shorter than minLength ${spec.minLength}` });
    }
    const overMaxLength = spec.maxLength !== undefined && value.length > spec.maxLength;
    if (overMaxLength) {
        errors.push({ path, message: `string longer than maxLength ${spec.maxLength}` });
    }
    // A value over `maxLength` is already refused, so its pattern is not run.
    if (spec.pattern !== undefined && !overMaxLength) {
        // `pattern` comes from a permissionless clause spec, so it is
        // untrusted. A value that would cost it more than MAX_PATTERN_WORK is
        // refused unrun, and so is the whole content once its values would
        // cost their patterns more than MAX_CONTENT_PATTERN_WORK; every other
        // value is matched in time linear in its length (safeRegex.ts).
        // A pattern that cannot be run refuses the value: a parsed spec never
        // carries one, but a spec built in code may, and no value is counted
        // as matching unchecked.
        const size = portablePatternSize(spec.pattern);
        if (size === null || !isRunnablePattern(spec.pattern)) {
            errors.push({ path, message: `pattern ${spec.pattern} cannot be run` });
        } else if (patternWorkExceeded(spec.pattern, value)) {
            errors.push({ path, message: `string too long for pattern ${spec.pattern}` });
        } else if (!isPrintableAscii(value)) {
            errors.push({ path, message: `string does not match pattern ${spec.pattern}` });
        } else if (!work.refused) {
            const cost = value.length * size;
            if (work.total + cost > MAX_CONTENT_PATTERN_WORK) {
                work.refused = true;
                errors.push({ path: "$", message: CONTENT_WORK_REFUSAL });
            } else {
                work.total += cost;
                if (!safeRegexTest(spec.pattern, value)) {
                    errors.push({ path, message: `string does not match pattern ${spec.pattern}` });
                }
            }
        }
    }
    if (spec.format !== undefined) {
        // Only the formats THIS validator knows are enforced; an unknown
        // (permissionlessly-declared) format validates as a plain string —
        // the open format axis (see StringFormat in spec.ts).
        const matches =
            spec.format === "bytes32-hex" ? isBytes32Hex(value) :
            spec.format === "address-hex" ? isAddressHex(value) :
            spec.format === "bytes-hex" ? BYTES_HEX_RE.test(value) :
            spec.format === "iso-datetime" ? ISO_DATETIME_RE.test(value) :
            true;
        if (!matches) {
            errors.push({ path, message: `string does not match format ${spec.format}` });
        }
    }
}

/** The largest value a `bigint` field carries: its ABI word is uint256. */
const UINT256_MAX = (1n << 256n) - 1n;

function validateInteger(value: unknown, spec: IntegerFieldSpec, path: string, errors: ValidationError[]): void {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push({ path, message: `expected integer, got ${typeof value}` });
        return;
    }
    // An `integer` is a JSON number, exact only inside the safe range: past
    // it two JSON texts name one JS number, and a reader in another language
    // reads a different integer from the same text. Larger values are a
    // `bigint` field's, carried as a decimal string. The published format
    // states the same bound (`clause-spec.schema.json`, a field's `type`).
    if (!Number.isSafeInteger(value)) {
        errors.push({ path, message: `value ${value} is outside the safe integer range` });
        return;
    }
    if (spec.min !== undefined && value < spec.min) {
        errors.push({ path, message: `value ${value} is below min ${spec.min}` });
    }
    if (spec.max !== undefined && value > spec.max) {
        errors.push({ path, message: `value ${value} is above max ${spec.max}` });
    }
}

function validateBigint(value: unknown, spec: BigintFieldSpec, path: string, errors: ValidationError[]): void {
    if (typeof value !== "string") {
        errors.push({ path, message: `expected bigint as decimal string, got ${typeof value}` });
        return;
    }
    if (!DECIMAL_BIGINT_RE.test(value)) {
        errors.push({ path, message: `value "${value}" does not parse as BigInt` });
        return;
    }
    const parsed = BigInt(value);
    // The field's ABI word is uint256: a signed value or one past the word
    // validates nowhere, because it encodes nowhere. The published format
    // states the same range (`clause-spec.schema.json`, a field's `type`).
    if (value.startsWith("-") || parsed > UINT256_MAX) {
        errors.push({ path, message: `value ${value} is outside the uint256 range` });
        return;
    }
    if (spec.min !== undefined && parsed < BigInt(spec.min)) {
        errors.push({ path, message: `value ${parsed} is below min ${spec.min}` });
    }
    if (spec.max !== undefined && parsed > BigInt(spec.max)) {
        errors.push({ path, message: `value ${parsed} is above max ${spec.max}` });
    }
}

function validateEnum(value: unknown, spec: EnumFieldSpec, path: string, errors: ValidationError[]): void {
    if (typeof value !== "string") {
        errors.push({ path, message: `expected enum string, got ${typeof value}` });
        return;
    }
    if (!spec.values.includes(value)) {
        errors.push({ path, message: `value "${value}" not in enum [${spec.values.join(", ")}]` });
    }
}

function validateArray(
    value: unknown,
    spec: ArrayFieldSpec,
    path: string,
    errors: ValidationError[],
    work: PatternWork,
): void {
    if (!Array.isArray(value)) {
        errors.push({ path, message: `expected array, got ${typeof value}` });
        return;
    }
    if (spec.minItems !== undefined && value.length < spec.minItems) {
        errors.push({ path, message: `array shorter than minItems ${spec.minItems}` });
    }
    if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        errors.push({ path, message: `array longer than maxItems ${spec.maxItems}` });
    }
    // An item has no siblings: its format resolves to its static `format`, and
    // the array field's own disposition governs how the whole list publishes.
    const itemFormat = resolveInputFormat(spec.items, [], undefined);
    for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        validateField(value[i], spec.items, itemPath, errors, work);
        validateGrain(value[i], itemFormat, spec.disposition, itemPath, errors);
    }
}

function validateObject(
    value: unknown,
    spec: ObjectFieldSpec,
    path: string,
    errors: ValidationError[],
    work: PatternWork,
): void {
    if (!isObject(value)) {
        errors.push({ path, message: `expected object, got ${typeof value}` });
        return;
    }
    const known = new Set<string>();
    const defaults = siblingDefaults(spec.fields);
    for (const field of spec.fields) {
        known.add(field.name);
        const childPath = path === "$" ? `$.${field.name}` : `${path}.${field.name}`;
        const childValue = ownValue(value, field.name);
        if (childValue === undefined) {
            if (field.required) {
                errors.push({ path: childPath, message: `required field "${field.name}" is missing` });
            }
            continue;
        }
        validateField(childValue, field, childPath, errors, work);
        const resolved = resolveFormatWith(field, value, (name) => defaults?.get(name));
        validateGrain(childValue, resolved, field.disposition, childPath, errors);
    }
    // Reject unknown fields — clause is a closed contract.
    for (const key of Object.keys(value)) {
        if (!known.has(key)) {
            const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
            errors.push({ path: childPath, message: `unknown field "${key}" not declared in clause` });
        }
    }
}

/**
 * The grain cap, cap(disposition, geocodeStandard), for each standard
 * `grain.ts` knows: geohash, H3, S2 and Open Location Code. The caller passes
 * the field's resolved format (`resolveInputFormat`: the static `format`, or
 * the value of the sibling `formatFromField` names, then that sibling's
 * default, then `format`) and the disposition that governs the value. When
 * the resolved format is one of those standards, a string that is no code of
 * it, or whose grade is finer than that disposition's cap, is refused;
 * `maxLength` stays the structural ceiling. It keys on the spec's own
 * attributes, never on a clause id or a field name. A standard this reader
 * carries no grain knowledge of is bounded by `maxLength` only.
 */
function validateGrain(
    value: unknown,
    resolvedFormat: string | undefined,
    disposition: FieldDisposition | undefined,
    path: string,
    errors: ValidationError[],
): void {
    const cap = grainCapOf(resolvedFormat);
    if (cap === undefined || resolvedFormat === undefined || typeof value !== "string") return;
    const allowed = capOfDisposition(cap, disposition);
    const grade = grainOf(resolvedFormat, value);
    if (grade === null || grade === undefined) {
        errors.push({ path, message: `not a ${resolvedFormat} code, so its grain cannot be read` });
    } else if (grade > allowed) {
        errors.push({
            path,
            message: resolvedFormat === GEOHASH_FORMAT
                ? `a ${disposition ?? "public"} geohash carries at most ${allowed} characters; give the cell's first ${allowed} characters`
                : `a ${disposition ?? "public"} ${resolvedFormat} code carries at most ${cap.grade} ${allowed}; this one carries ${grade}`,
        });
    }
}

function validateField(
    value: unknown,
    spec: FieldSpec,
    path: string,
    errors: ValidationError[],
    work: PatternWork,
): void {
    switch (spec.type) {
        case "string": validateString(value, spec, path, errors, work); return;
        case "integer": validateInteger(value, spec, path, errors); return;
        case "bigint": validateBigint(value, spec, path, errors); return;
        case "boolean":
            if (typeof value !== "boolean") {
                errors.push({ path, message: `expected boolean, got ${typeof value}` });
            }
            return;
        case "enum": validateEnum(value, spec, path, errors); return;
        case "array": validateArray(value, spec, path, errors, work); return;
        case "object": validateObject(value, spec, path, errors, work); return;
    }
}

/**
 * Validate content against a ClauseSpec. If `options.stage` is set and the
 * spec defines a matching stage override, those fields are used; otherwise
 * the spec's default `fields` apply. One call is one content: the pattern
 * work it may spend, MAX_CONTENT_PATTERN_WORK, is counted over this call
 * alone — one clause entry's signed content, or one attestation's stage
 * content.
 */
export function validateContent(
    content: unknown,
    spec: ClauseSpec,
    options: ValidateOptions = {},
): ValidationResult {
    const fields: readonly FieldSpec[] = contentFieldsFor(spec, options);
    const errors: ValidationError[] = [];
    // Treat the root content as a pseudo-object with the spec's top-level fields.
    const rootSpec: ObjectFieldSpec = { name: "$", required: true, type: "object", fields };
    validateObject(content, rootSpec, "$", errors, { total: 0, refused: false });
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * Validate the content the parties SIGN for a clause: the content committed
 * under the `checkoutHash`. A spec that declares `emptyAnchor` signs the
 * empty anchor `{}` and nothing else; every other spec's signed content,
 * `{}` included, validates over its top-level `fields` (`validateContent`
 * with no stage). The rule reads the spec's top level, never its `block`.
 */
export function validateSignedContent(content: unknown, spec: ClauseSpec): ValidationResult {
    if (spec.emptyAnchor !== true) return validateContent(content, spec);
    const empty = content !== null && typeof content === "object" && !Array.isArray(content)
        && Object.keys(content).length === 0;
    return empty ? { ok: true } : {
        ok: false,
        errors: [{ path: "$", message: "the spec declares emptyAnchor: its signed content is the empty anchor {}" }],
    };
}
