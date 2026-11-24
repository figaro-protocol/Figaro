/**
 * Figaro clause-spec format — the parser of the published clause format
 * (`clause-spec.schema.json`). This off-chain TypeScript module (frontend form
 * gates, SDK agent-action preflight) is the sign gate of this project's tools.
 * Neither path validates content: the chain and the proof program merkle-bind
 * attestations and carry the evidence's fingerprint; well-formedness is this
 * layer's job and a reader's check against the spec the clause key names.
 *
 * The format is a closed subset of JSON Schema: small and predictable. A spec
 * is DATA (a JSON file in `clauses/`, anchored on `ClauseRegistry` → IPFS),
 * never code — a new clause adds a spec, not a code path.
 */

import { isPortablePattern, isRunnablePattern } from "./safeRegex.js";

export type FieldType =
    | "string"
    | "integer"
    | "bigint"
    | "boolean"
    | "enum"
    | "array"
    | "object";

/**
 * String-field format. The named literals are the formats THIS validator
 * enforces (and the encoder maps to ABI types); the open `string & {}` arm
 * keeps the axis permissionless — a clause may declare any format
 * (`"geohash"`, a never-seen one) and every consumer degrades gracefully:
 * validation skips the format check (plain string), encoding falls to the
 * `string` ABI type, and a frontend may map known formats to richer input
 * components. A closed set here would make any third-party clause with a
 * novel format unparseable everywhere — the closed-world failure.
 */
export type StringFormat =
    | "bytes32-hex"
    | "address-hex"
    | "bytes-hex"
    | "iso-datetime"
    | (string & {});

/**
 * Whether a field's committed value belongs to the PUBLIC coordination commons
 * or is PRIVATE paid-edge data — the clause-spec side of the public/private data
 * seam.
 *   - "public"  (the default): learnable for free. The shared map that makes
 *     coordination possible — topology, denominations, standards, localities.
 *     Published in the open (plaintext IPFS), indexable.
 *   - "private": the scarce edge an agent PAYS to learn from. Published only
 *     behind the fingerprint (encrypted IPFS, or a content-withheld clause);
 *     the merkle leaf still binds it, but the plaintext is never public.
 * The chain carries only the clause data hash either way (calldata never holds a
 * preimage — enforced at the contract tier). Disposition governs HOW a
 * frontend/SDK publishes the value, and per-field grain policy (see
 * figaro-geolocation's grain cap). Absent ⇒ "public": the commons is the norm,
 * privacy the marked exception.
 */
export type FieldDisposition = "public" | "private";

export interface BaseFieldSpec {
    name: string;
    required: boolean;
    description?: string;
    /** The public/private disposition of this field's committed value. Absent
     *  ⇒ "public". See {@link FieldDisposition}. */
    disposition?: FieldDisposition;
    /** Marks the set's blinding field: a random 32-byte value the party that
     *  fills the set draws fresh for each commitment or attestation, so the
     *  set's fingerprint (a clause's data hash, a witness's `contentRef`)
     *  cannot be confirmed by hashing guesses of a value with few
     *  possibilities. A set (the top-level `fields`, or one `stages[N]`) that
     *  declares a private field declares exactly one, at its top level, of
     *  type `string`, format `bytes32-hex`, required, private and with no
     *  `default`; a set with no other private field declares none
     *  (`parseClauseSpec`). Present only as `true`. The value is content like
     *  any other field: it enters the data hash and the encoded bytes, and
     *  tooling draws it, never a person's form. */
    blinding?: true;
    /** Build/UI default applied when the composing input omits this field.
     *  Purely composition metadata — the ABI encoder ignores it (an absent
     *  optional still encodes as the ABI zero-value), so Layers B/C are
     *  unaffected. Shape must match the field type (validated at parse). */
    default?: string | number | boolean | readonly string[];
    /** Human display label for this field. Purely cosmetic UI metadata —
     *  nothing on-chain reads it (like `block`), so it is an
     *  off-chain-only field. Lets every render surface (drawer, canvas, checkout,
     *  analysis) name the field from the spec; absent → callers fall back to
     *  the field `name`. */
    label?: string;
}

export interface StringFieldSpec extends BaseFieldSpec {
    type: "string";
    format?: StringFormat;
    /** VALUE-DRIVEN input format: name a SIBLING field whose committed VALUE is
     *  the format key, instead of the static `format` above. Lets one field's
     *  richer input follow an open, per-composition standard axis — e.g.
     *  figaro-geolocation's origin/destination declare
     *  `formatFromField: "geocodeStandard"`, so the geohash picker (with its
     *  grain cap) renders when the committed standard is `geohash` and degrades
     *  to plain text for standards this frontend registered no input for. A
     *  reader resolves it with {@link resolveInputFormat}, as
     *  `values[formatFromField] ?? <sibling default> ?? format`; content
     *  validation applies the grain cap of geohash, H3, S2 and Open Location
     *  Code to the resolved format, static or named by a sibling (`grain.ts`). A stage field's sibling is a field
     *  of the same stage. */
    formatFromField?: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}

export interface IntegerFieldSpec extends BaseFieldSpec {
    type: "integer";
    min?: number;
    max?: number;
}

export interface BigintFieldSpec extends BaseFieldSpec {
    type: "bigint";
    /** Min/max as decimal strings — JSON cannot represent bigint natively. */
    min?: string;
    max?: string;
}

export interface BooleanFieldSpec extends BaseFieldSpec {
    type: "boolean";
}

export interface EnumFieldSpec extends BaseFieldSpec {
    type: "enum";
    values: readonly string[];
    /** An enum value reserved as the ABI position-as-index placeholder
     *  (conventionally index 0, a value such as "none" that names no term).
     *  It lets a spec keep its real values at positions 1 and up; it is never
     *  a valid composition input, and no default may name it. No
     *  reference clause declares one: every value of
     *  `figaro-arbitration-kleros`'s `klerosCourt`, `general` included, names
     *  a real court. */
    sentinel?: string;
    /** Per-value human display labels (value → label), e.g.
     *  `{ "zone-wifi": "Same Wi-Fi network" }`. Purely cosmetic off-chain
     *  metadata nothing on-chain reads; a render surface labels the
     *  selected value from here, falling back to the raw value when absent.
     *  Need not cover every value — unlisted values render raw. */
    valueLabels?: Readonly<Record<string, string>>;
}

export interface ArrayFieldSpec extends BaseFieldSpec {
    type: "array";
    items: FieldSpec;
    minItems?: number;
    maxItems?: number;
}

export interface ObjectFieldSpec extends BaseFieldSpec {
    type: "object";
    fields: readonly FieldSpec[];
}

export type FieldSpec =
    | StringFieldSpec
    | IntegerFieldSpec
    | BigintFieldSpec
    | BooleanFieldSpec
    | EnumFieldSpec
    | ArrayFieldSpec
    | ObjectFieldSpec;

/**
 * The value a content object holds under `key` as its own property, or
 * `undefined` when it holds none. A property the object inherits (`toString`,
 * `constructor`) is no value of the content: a field of that name that the
 * content leaves out is absent, as a JSON reader in any language reads it.
 */
export function ownValue(values: Record<string, unknown> | undefined, key: string): unknown {
    return values !== undefined && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/**
 * Resolve a string field's format: the static `format`, unless the field
 * declares `formatFromField`, in which case the format is the committed VALUE
 * of the named sibling, then that sibling's spec `default`, then `format`.
 * One resolution for every reader: `validateContent` applies the grain cap
 * through it, and a form picks a field's input through it. It reads only
 * spec-declared names and sibling values, never a clause id.
 */
export function resolveInputFormat(
    field: FieldSpec,
    siblings: readonly FieldSpec[],
    values: Record<string, unknown> | undefined,
): string | undefined {
    return resolveFormatWith(field, values, (name) => stringDefault(siblings.find((s) => s.name === name)));
}

/** The one resolution behind `resolveInputFormat`, with the sibling's default
 *  read through `defaultOf` (the first field of that name, as `find` reads
 *  it). `validateContent` passes a map built once per object
 *  (`siblingDefaults`), so a set of n fields costs n lookups, not n squared
 *  comparisons. */
export function resolveFormatWith(
    field: FieldSpec,
    values: Record<string, unknown> | undefined,
    defaultOf: (name: string) => string | undefined,
): string | undefined {
    if (field.type !== "string") return undefined;
    if (!field.formatFromField) return field.format;
    const live = ownValue(values, field.formatFromField);
    if (typeof live === "string" && live.length > 0) return live;
    return defaultOf(field.formatFromField) ?? field.format;
}

/** A field's `default` when it is a non-empty string. */
function stringDefault(field: FieldSpec | undefined): string | undefined {
    return field !== undefined && typeof field.default === "string" && field.default.length > 0 ? field.default : undefined;
}

/** Each name of a field set mapped to its first field's string default, or
 *  `undefined` when no field of the set declares `formatFromField`. */
export function siblingDefaults(fields: readonly FieldSpec[]): Map<string, string | undefined> | undefined {
    if (!fields.some((f) => f.type === "string" && f.formatFromField)) return undefined;
    const defaults = new Map<string, string | undefined>();
    for (const f of fields) if (!defaults.has(f.name)) defaults.set(f.name, stringDefault(f));
    return defaults;
}

export interface ClauseSpec {
    /** The human-readable clause name (e.g. `figaro-emissions`) — PRESENTATION:
     *  a title a reader shows. The clause's identity is its key, `keccak256` of
     *  the canonical spec without `block` (`computeClauseKey`); two specs sharing a name
     *  are two clauses. */
    clauseId: string;
    /** A lineage counter a human reads — PRESENTATION, a separate field never
     *  embedded in `clauseId`. Nothing on chain or in a leaf reads it. */
    version: number;
    /** Display title. */
    title: string;
    /** Prose description. */
    description: string;
    /** Default field shape; applies to all stages unless a stage override is set. */
    fields: readonly FieldSpec[];
    /** Optional per-stage overrides, keyed by the stage key of the on-chain
     *  `uint8 stage` (`stageKey`, `stageOfKey`); read one through
     *  `declaredStageFields`. */
    stages?: Readonly<Record<string, readonly FieldSpec[]>>;
    /** Declares that the content the parties sign for this clause is the
     *  empty anchor `{}`: the clause commits no content, and every field it
     *  declares is the shape of content attested while the process is open
     *  (a process-log clause, whose stage-0 event is attested like any
     *  other). The sign gate accepts `{}` for such a clause and refuses any
     *  other content; a clause that does not declare it is validated over
     *  `fields` like any clause, `{}` included. Present only as `true`, and
     *  never beside a top-level field's `default`, since a default fills the
     *  signed content and this one has none (`parseClauseSpec`). It is
     *  protocol, read by the sign gate, never by a clause's name or its
     *  `block`. */
    emptyAnchor?: true;
    // The `block` slice of the spec JSON (designer/runtime composition metadata)
    // is NOT parsed here — it's pure presentation the SDK never reads. The
    // frontend parses it off the same JSON (`lib/shared/clauseBlockBinding`).
    // AUTHORS: the clause key covers the RAW document without its top-level
    // `block` (`computeClauseKey(raw)`); pin `canonicalize(raw)` so a reader
    // gets the presentation too. The parsed spec here carries no `block`.
}

export interface SpecParseError {
    /** JSON-pointer-style path to the problem location. */
    path: string;
    message: string;
}

export type ParseClauseSpecResult =
    | { ok: true; spec: ClauseSpec }
    | { ok: false; errors: SpecParseError[] };

const VALID_FIELD_TYPES: ReadonlySet<string> = new Set([
    "string", "integer", "bigint", "boolean", "enum", "array", "object",
]);

/** The bigint grammar: a plain decimal integer, optionally negative.
 *  Deliberately TIGHTER than bare `BigInt()` (which coerces `""`, `"0x10"`,
 *  and padded whitespace) — the published format's contract is "decimal
 *  string" (`clause-spec.schema.json`, a field's `type`), so a reader's tool
 *  in any language applies the same grammar. */
const DECIMAL_BIGINT_RE = /^-?[0-9]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate a `default` against its parsed field spec. Object fields can't
 *  carry defaults; enum/array-enum defaults must be member values (and not
 *  the sentinel); numeric defaults respect min/max. */
function defaultMatchesField(spec: FieldSpec, value: unknown): boolean {
    switch (spec.type) {
        case "string":
            return typeof value === "string";
        case "integer":
            return typeof value === "number" && Number.isSafeInteger(value)
                && (spec.min === undefined || value >= spec.min)
                && (spec.max === undefined || value <= spec.max);
        case "bigint":
            return typeof value === "string" && DECIMAL_BIGINT_RE.test(value);
        case "boolean":
            return typeof value === "boolean";
        case "enum":
            return typeof value === "string" && spec.values.includes(value) && value !== spec.sentinel;
        case "array":
            return Array.isArray(value) && value.every((v) => defaultMatchesField(spec.items, v));
        case "object":
            return false;
    }
}

/** Parse+validate ONE field spec (the same rules `parseClauseSpec` applies to a
 *  clause's content `fields`). Exported so other surfaces can parse field specs
 *  that live outside a clause's content — e.g. the frontend's
 *  `block.checkout.compositionFields` (a composition's input fields, filled at checkout). Pushes `SpecParseError`s on `errors`
 *  and returns null on any malformed field. */
/** Max field-spec nesting depth. A real clause field nests a handful deep
 *  (object → array → object); this ceiling exists only to turn an adversarial
 *  permissionlessly-registered spec (thousands-deep `object.fields` / `array.items`)
 *  into a clean parse rejection instead of a `RangeError: Maximum call stack`
 *  that could crash a consuming agent or clause surface. */
const MAX_FIELD_DEPTH = 16;

export function parseFieldSpec(raw: unknown, path: string, errors: SpecParseError[], depth = 0): FieldSpec | null {
    if (depth > MAX_FIELD_DEPTH) {
        errors.push({ path, message: `field nesting exceeds the maximum depth of ${MAX_FIELD_DEPTH}` });
        return null;
    }
    const spec = parseFieldSpecCore(raw, path, errors, depth);
    if (spec === null) return null;
    const rawDefault = (raw as Record<string, unknown>).default;
    if (rawDefault !== undefined) {
        if (!defaultMatchesField(spec, rawDefault)) {
            errors.push({ path: `${path}.default`, message: "default must match the field's type/constraints (objects can't carry defaults; enum defaults can't be the sentinel)" });
            return null;
        }
        spec.default = rawDefault as BaseFieldSpec["default"];
    }
    if (spec.blinding === true && !blindingShapeHolds(spec, path, errors, depth)) return null;
    return spec;
}

/** The format a blinding field carries: 32 bytes as hex, which the
 *  validator checks and the encoder writes as `bytes32`. */
const BLINDING_FORMAT = "bytes32-hex";

/** The one shape of a blinding field (`BaseFieldSpec.blinding`): a top-level
 *  string of format `bytes32-hex`, required, private, with no default. Pushes
 *  one error per broken rule and returns whether all hold. */
function blindingShapeHolds(spec: FieldSpec, path: string, errors: SpecParseError[], depth: number): boolean {
    const before = errors.length;
    if (depth > 0) {
        errors.push({ path: `${path}.blinding`, message: "a blinding field is a top-level field of its set, never nested in an object or an array" });
    }
    if (spec.type !== "string") {
        errors.push({ path: `${path}.type`, message: `a blinding field is of type "string"` });
    } else if (spec.format !== BLINDING_FORMAT) {
        errors.push({ path: `${path}.format`, message: `a blinding field carries format "${BLINDING_FORMAT}"` });
    }
    if (!spec.required) {
        errors.push({ path: `${path}.required`, message: "a blinding field is required" });
    }
    if (spec.disposition !== "private") {
        errors.push({ path: `${path}.disposition`, message: `a blinding field is "private"` });
    }
    if (spec.default !== undefined) {
        errors.push({ path: `${path}.default`, message: "a blinding field carries no default: a default is the same in every order, so it blinds nothing" });
    }
    return errors.length === before;
}

/**
 * Whether a field declares a private value: its own disposition is
 * `private`, or a field nested in it (an object's `fields`, an array's
 * `items`, at any depth) is. A set is withheld as a whole, so a private
 * field nested in a public one would publish in plaintext; the set rules
 * count the top-level field that holds it as private, so the set it stands
 * in is private as a whole and carries its blinding field.
 */
export function fieldCarriesPrivate(field: FieldSpec): boolean {
    if (field.disposition === "private") return true;
    if (field.type === "object") return field.fields.some(fieldCarriesPrivate);
    if (field.type === "array") return fieldCarriesPrivate(field.items);
    return false;
}

/**
 * The rules of one field set (the top-level `fields`, or one `stages[N]`):
 * it does not mix public and private fields (a field counts as private when
 * it or a field nested in it is, `fieldCarriesPrivate`), and a set that declares a
 * private field declares exactly one blinding field, while a set with no
 * other private field declares none. The leaf model withholds a whole set,
 * never one field (`agreement.ts`), so a mixed set either over-redacts its
 * public fields or leaks its private ones; and a private set's fingerprint
 * without a fresh random value can be confirmed by hashing guesses.
 */
function fieldSetRulesHold(fields: readonly FieldSpec[], path: string, errors: SpecParseError[]): void {
    if (fields.length === 0) return;
    const blindingCount = fields.filter((f) => f.blinding === true).length;
    const privateValues = fields.filter((f) => fieldCarriesPrivate(f) && f.blinding !== true).length;
    const anyPublic = fields.some((f) => f.disposition !== "private");
    if (anyPublic && (privateValues > 0 || blindingCount > 0)) {
        errors.push({
            path,
            message: "a clause may not mix public and private field dispositions — a clause is withheld as a whole; author private fields as their own clause",
        });
    }
    if (privateValues > 0 && blindingCount !== 1) {
        errors.push({
            path,
            message: `a set that declares a private field declares exactly one blinding field ("blinding": true); this set declares ${blindingCount}`,
        });
    }
    if (privateValues === 0 && blindingCount > 0) {
        errors.push({
            path,
            message: "a blinding field stands only beside another private field; this set declares no private field",
        });
    }
}

/**
 * The private set's rules over one field set (the top-level `fields`, or one
 * `stages[N]`), as `parseClauseSpec` applies them: the set does not mix
 * public and private fields; a set that declares a private field declares
 * exactly one blinding field, a set with no other private field declares
 * none; and each blinding field has its one shape at the set's top level.
 * Returns one error per broken rule, an empty list when all hold. A reader
 * handed a spec view that may not have come through the parser (a sign gate,
 * an attestation's preflight) re-checks the view with it: one implementation
 * of the rules, here.
 */
export function fieldSetRuleErrors(fields: readonly FieldSpec[], path: string): SpecParseError[] {
    const errors: SpecParseError[] = [];
    fields.forEach((field, i) => {
        if (field.blinding === true) blindingShapeHolds(field, `${path}[${i}]`, errors, 0);
    });
    fieldSetRulesHold(fields, path, errors);
    return errors;
}

function parseFieldSpecCore(raw: unknown, path: string, errors: SpecParseError[], depth: number): FieldSpec | null {
    if (!isObject(raw)) {
        errors.push({ path, message: "field spec must be an object" });
        return null;
    }
    const name = raw.name;
    if (typeof name !== "string" || name.length === 0) {
        errors.push({ path: `${path}.name`, message: "field name must be a non-empty string" });
        return null;
    }
    const required = raw.required;
    if (typeof required !== "boolean") {
        errors.push({ path: `${path}.required`, message: "required must be a boolean" });
        return null;
    }
    const description = raw.description;
    if (description !== undefined && typeof description !== "string") {
        errors.push({ path: `${path}.description`, message: "description must be a string when present" });
        return null;
    }
    const label = raw.label;
    if (label !== undefined && typeof label !== "string") {
        errors.push({ path: `${path}.label`, message: "label must be a string when present" });
        return null;
    }
    const disposition = raw.disposition;
    if (disposition !== undefined && disposition !== "public" && disposition !== "private") {
        errors.push({ path: `${path}.disposition`, message: 'disposition must be "public" or "private" when present' });
        return null;
    }
    const blinding = raw.blinding;
    if (blinding !== undefined && blinding !== true) {
        errors.push({ path: `${path}.blinding`, message: "blinding must be true when present" });
        return null;
    }
    const type = raw.type;
    if (typeof type !== "string" || !VALID_FIELD_TYPES.has(type)) {
        errors.push({ path: `${path}.type`, message: `type must be one of: ${[...VALID_FIELD_TYPES].join(", ")}` });
        return null;
    }
    const base: BaseFieldSpec = {
        name,
        required,
        ...(description !== undefined && { description }),
        ...(label !== undefined && { label }),
        ...(disposition !== undefined && { disposition: disposition as FieldDisposition }),
        ...(blinding === true && { blinding: true as const }),
    };

    switch (type) {
        case "string": {
            const spec: StringFieldSpec = { ...base, type: "string" };
            if (raw.format !== undefined) {
                // The format AXIS is open (see StringFormat): any string is a
                // valid declaration; only its SHAPE is checked here. Unknown
                // formats validate as plain strings downstream.
                if (typeof raw.format !== "string" || raw.format.length === 0) {
                    errors.push({ path: `${path}.format`, message: "format must be a non-empty string" });
                    return null;
                }
                spec.format = raw.format as StringFormat;
            }
            if (raw.formatFromField !== undefined) {
                if (typeof raw.formatFromField !== "string" || raw.formatFromField.length === 0) {
                    errors.push({ path: `${path}.formatFromField`, message: "formatFromField must be a non-empty string (a sibling field name)" });
                    return null;
                }
                spec.formatFromField = raw.formatFromField;
            }
            if (raw.minLength !== undefined) {
                if (typeof raw.minLength !== "number" || !Number.isSafeInteger(raw.minLength) || raw.minLength < 0) {
                    errors.push({ path: `${path}.minLength`, message: "minLength must be a non-negative integer" });
                    return null;
                }
                spec.minLength = raw.minLength;
            }
            if (raw.maxLength !== undefined) {
                if (typeof raw.maxLength !== "number" || !Number.isSafeInteger(raw.maxLength) || raw.maxLength < 0) {
                    errors.push({ path: `${path}.maxLength`, message: "maxLength must be a non-negative integer" });
                    return null;
                }
                spec.maxLength = raw.maxLength;
            }
            if (raw.pattern !== undefined) {
                if (typeof raw.pattern !== "string") {
                    errors.push({ path: `${path}.pattern`, message: "pattern must be a string (regex)" });
                    return null;
                }
                if (!isPortablePattern(raw.pattern)) {
                    errors.push({ path: `${path}.pattern`, message: "pattern must be written in the portable core" });
                    return null;
                }
                try { new RegExp(raw.pattern); } catch {
                    errors.push({ path: `${path}.pattern`, message: "pattern must be a valid regex" });
                    return null;
                }
                // The automaton is built now, when the spec parses: a
                // pattern that cannot be built never reaches a value.
                if (!isRunnablePattern(raw.pattern)) {
                    errors.push({ path: `${path}.pattern`, message: "pattern must compile to an automaton" });
                    return null;
                }
                spec.pattern = raw.pattern;
            }
            return spec;
        }
        case "integer": {
            const spec: IntegerFieldSpec = { ...base, type: "integer" };
            if (raw.min !== undefined) {
                if (typeof raw.min !== "number" || !Number.isSafeInteger(raw.min)) {
                    errors.push({ path: `${path}.min`, message: "min must be an integer" });
                    return null;
                }
                spec.min = raw.min;
            }
            if (raw.max !== undefined) {
                if (typeof raw.max !== "number" || !Number.isSafeInteger(raw.max)) {
                    errors.push({ path: `${path}.max`, message: "max must be an integer" });
                    return null;
                }
                spec.max = raw.max;
            }
            return spec;
        }
        case "bigint": {
            const spec: BigintFieldSpec = { ...base, type: "bigint" };
            const checkBig = (key: "min" | "max") => {
                const v = raw[key];
                if (v === undefined) return true;
                if (typeof v !== "string") {
                    errors.push({ path: `${path}.${key}`, message: `${key} must be a decimal string for bigint` });
                    return false;
                }
                if (!DECIMAL_BIGINT_RE.test(v)) {
                    errors.push({ path: `${path}.${key}`, message: `${key} must parse as a BigInt` });
                    return false;
                }
                spec[key] = v;
                return true;
            };
            if (!checkBig("min") || !checkBig("max")) return null;
            return spec;
        }
        case "boolean":
            return { ...base, type: "boolean" };
        case "enum": {
            if (!Array.isArray(raw.values) || raw.values.length === 0) {
                errors.push({ path: `${path}.values`, message: "enum requires a non-empty values array" });
                return null;
            }
            // Enums encode as uint8 (the 0-based position in `values`), so a
            // spec with more than 256 values would parse here and then throw
            // at the first ENCODE — after registration, when first-write-wins
            // has already made it permanent. Refuse at parse time instead.
            if (raw.values.length > 256) {
                errors.push({ path: `${path}.values`, message: `enum encodes as uint8 — at most 256 values (got ${raw.values.length})` });
                return null;
            }
            for (let i = 0; i < raw.values.length; i++) {
                if (typeof raw.values[i] !== "string") {
                    errors.push({ path: `${path}.values[${i}]`, message: "enum values must be strings" });
                    return null;
                }
            }
            const spec: EnumFieldSpec = { ...base, type: "enum", values: raw.values as readonly string[] };
            if (raw.sentinel !== undefined) {
                if (typeof raw.sentinel !== "string" || !(raw.values as string[]).includes(raw.sentinel)) {
                    errors.push({ path: `${path}.sentinel`, message: "sentinel must be one of the enum values" });
                    return null;
                }
                spec.sentinel = raw.sentinel;
            }
            if (raw.valueLabels !== undefined) {
                if (!isObject(raw.valueLabels)) {
                    errors.push({ path: `${path}.valueLabels`, message: "valueLabels must be an object (value → label) when present" });
                    return null;
                }
                const labels: Record<string, string> = {};
                for (const [k, v] of Object.entries(raw.valueLabels)) {
                    if (typeof v !== "string") {
                        errors.push({ path: `${path}.valueLabels.${k}`, message: "valueLabels entries must be strings" });
                        return null;
                    }
                    if (!(raw.values as string[]).includes(k)) {
                        errors.push({ path: `${path}.valueLabels.${k}`, message: "valueLabels key must be one of the enum values" });
                        return null;
                    }
                    labels[k] = v;
                }
                spec.valueLabels = labels;
            }
            return spec;
        }
        case "array": {
            if (!isObject(raw.items)) {
                errors.push({ path: `${path}.items`, message: "array requires an items field spec" });
                return null;
            }
            const items = parseFieldSpec({ ...raw.items, name: "*", required: true }, `${path}.items`, errors, depth + 1);
            if (items === null) return null;
            const spec: ArrayFieldSpec = { ...base, type: "array", items };
            if (raw.minItems !== undefined) {
                if (typeof raw.minItems !== "number" || !Number.isSafeInteger(raw.minItems) || raw.minItems < 0) {
                    errors.push({ path: `${path}.minItems`, message: "minItems must be a non-negative integer" });
                    return null;
                }
                spec.minItems = raw.minItems;
            }
            if (raw.maxItems !== undefined) {
                if (typeof raw.maxItems !== "number" || !Number.isSafeInteger(raw.maxItems) || raw.maxItems < 0) {
                    errors.push({ path: `${path}.maxItems`, message: "maxItems must be a non-negative integer" });
                    return null;
                }
                spec.maxItems = raw.maxItems;
            }
            return spec;
        }
        case "object": {
            if (!Array.isArray(raw.fields)) {
                errors.push({ path: `${path}.fields`, message: "object requires a fields array" });
                return null;
            }
            const fields: FieldSpec[] = [];
            for (let i = 0; i < raw.fields.length; i++) {
                const child = parseFieldSpec(raw.fields[i], `${path}.fields[${i}]`, errors, depth + 1);
                if (child !== null) fields.push(child);
            }
            return { ...base, type: "object", fields };
        }
    }
    return null;
}

/** Does `value` hold a UTF-16 surrogate that is not half of a pair? */
export function hasLoneSurrogate(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 0xd800 || code > 0xdfff) continue;
        if (code >= 0xdc00) return true;
        const next = value.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i++;
    }
    return false;
}

/**
 * Push an issue for each string and each object key of the protocol half of a
 * spec (every top-level attribute but `block`) that holds a lone UTF-16
 * surrogate. `JSON.parse` keeps one (`"\ud800"`), and `canonicalize` writes
 * it back as that escape, so the bytes a clause key hashes hold it; a strict
 * JSON reader in another language (Rust's `serde_json`, for one) refuses
 * them. A spec such a reader cannot read does not parse here either.
 * `block` is left out of the key, so it is not walked. The
 * walk keeps its own stack, so a deep unknown attribute cannot overflow the
 * call stack.
 */
function loneSurrogateIssues(raw: Record<string, unknown>, errors: SpecParseError[]): void {
    const pending: Array<[unknown, string]> = [];
    for (const [key, value] of Object.entries(raw)) {
        if (key === "block") continue;
        if (hasLoneSurrogate(key)) errors.push({ path: "$", message: "a key holds a lone UTF-16 surrogate" });
        pending.push([value, `$.${key}`]);
    }
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        const [value, path] = next;
        if (typeof value === "string") {
            if (hasLoneSurrogate(value)) errors.push({ path, message: "string holds a lone UTF-16 surrogate" });
        } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) pending.push([value[i], `${path}[${i}]`]);
        } else if (isObject(value)) {
            for (const [key, child] of Object.entries(value)) {
                if (hasLoneSurrogate(key)) errors.push({ path, message: "a key holds a lone UTF-16 surrogate" });
                pending.push([child, `${path}.${key}`]);
            }
        }
    }
}

const STAGE_KEY_MESSAGE = "stage key must be the decimal of an integer 0..255: digits only, no sign, no leading zero";

/**
 * The stage a `stages` key names, or `undefined` when the key is not a stage
 * key. A stage key has one spelling: the decimal of the on-chain
 * `uint8 stage`, digits only, with no sign, no leading zero and no
 * whitespace ("0" to "255"). A spec with any other key does not parse. The
 * published format states the same rule (`clause-spec.schema.json`,
 * `stages`).
 */
export function stageOfKey(key: string): number | undefined {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(key)) return undefined;
    const stage = Number(key);
    return stage <= 255 ? stage : undefined;
}

/** The `stages` key of a stage, the inverse of `stageOfKey`; `undefined`
 *  when the number is not a `uint8`. */
export function stageKey(stage: number): string | undefined {
    return Number.isInteger(stage) && stage >= 0 && stage <= 255 ? String(stage) : undefined;
}

/** The field set a spec declares for `stage` in `stages`, or `undefined`
 *  when it declares none. `contentFieldsFor` falls back to `fields`. */
export function declaredStageFields(spec: ClauseSpec, stage: number): readonly FieldSpec[] | undefined {
    const key = stageKey(stage);
    return key === undefined ? undefined : spec.stages?.[key];
}

/**
 * Parse and validate an unknown value as a ClauseSpec. Validates the
 * meta-clause (the structure of the spec itself, not any content).
 */
export function parseClauseSpec(raw: unknown): ParseClauseSpecResult {
    const errors: SpecParseError[] = [];
    if (!isObject(raw)) {
        return { ok: false, errors: [{ path: "$", message: "clause spec must be an object" }] };
    }
    loneSurrogateIssues(raw, errors);
    const { clauseId, version, title, description, fields, stages, emptyAnchor } = raw;
    if (typeof clauseId !== "string" || clauseId.length === 0) {
        errors.push({ path: "$.clauseId", message: "clauseId must be a non-empty string" });
    }
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
        errors.push({ path: "$.version", message: "version must be a non-negative integer" });
    }
    if (typeof title !== "string" || title.length === 0) {
        errors.push({ path: "$.title", message: "title must be a non-empty string" });
    }
    if (typeof description !== "string") {
        errors.push({ path: "$.description", message: "description must be a string" });
    }
    if (!Array.isArray(fields)) {
        errors.push({ path: "$.fields", message: "fields must be an array" });
    }
    const parsedFields: FieldSpec[] = [];
    if (Array.isArray(fields)) {
        for (let i = 0; i < fields.length; i++) {
            const child = parseFieldSpec(fields[i], `$.fields[${i}]`, errors);
            if (child !== null) parsedFields.push(child);
        }
    }
    // A clause commits a clause's content fields as ONE merkle leaf, and the
    // leaf model withholds a WHOLE clause, never a single field (agreement.ts).
    // So a clause whose content fields MIX public and private dispositions cannot
    // be published safely: withholding it for a public pin over-redacts its
    // public fields, and NOT withholding leaks its private ones. Author private
    // data as its own clause (see `figaro-geolocation`'s "private version" note).
    // A private set carries its one blinding field. Each stage's set is held
    // to the same rules below.
    fieldSetRulesHold(parsedFields, "$.fields", errors);
    let parsedStages: Record<string, readonly FieldSpec[]> | undefined;
    if (stages !== undefined) {
        if (!isObject(stages)) {
            errors.push({ path: "$.stages", message: "stages must be an object keyed by stage number" });
        } else {
            parsedStages = {};
            for (const [key, value] of Object.entries(stages)) {
                if (stageOfKey(key) === undefined) {
                    errors.push({ path: `$.stages.${key}`, message: STAGE_KEY_MESSAGE });
                    continue;
                }
                if (!Array.isArray(value)) {
                    errors.push({ path: `$.stages.${key}`, message: "stage entry must be a fields array" });
                    continue;
                }
                const stageFields: FieldSpec[] = [];
                for (let i = 0; i < value.length; i++) {
                    const child = parseFieldSpec(value[i], `$.stages.${key}[${i}]`, errors);
                    if (child !== null) stageFields.push(child);
                }
                fieldSetRulesHold(stageFields, `$.stages.${key}`, errors);
                parsedStages[key] = stageFields;
            }
        }
    }
    // The empty anchor: the signed content is `{}`, so no top-level field
    // carries a `default`, which would fill content the clause never signs.
    if (emptyAnchor !== undefined && emptyAnchor !== true) {
        errors.push({ path: "$.emptyAnchor", message: "emptyAnchor must be true when present" });
    }
    if (emptyAnchor === true && Array.isArray(fields)) {
        fields.forEach((field, i) => {
            if (isObject(field) && field.default !== undefined) {
                errors.push({
                    path: `$.fields[${i}].default`,
                    message: "a clause that signs the empty anchor (emptyAnchor) declares no top-level default: its signed content is {}, so a default fills nothing",
                });
            }
        });
    }
    // The `block` slice is presentation metadata the SDK does not own — the
    // frontend parses it (`lib/shared/clauseBlockBinding`). It's ignored here.
    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        spec: {
            clauseId: clauseId as string,
            version: version as number,
            title: title as string,
            description: description as string,
            fields: parsedFields,
            ...(parsedStages !== undefined && { stages: parsedStages }),
            ...(emptyAnchor === true && { emptyAnchor: true as const }),
        },
    };
}
