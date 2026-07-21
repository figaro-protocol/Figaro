/**
 * Figaro clause-spec format — the single source of truth for clause-content
 * validation. This off-chain TypeScript module (frontend form gates, SDK
 * agent-action preflight) is Layer A, the reference; the Rust prover mirror
 * (`prover/clause`) re-runs the same semantics in-proof on the batched path,
 * against the spec as a witness input anchored by ClauseRegistry.contentHashOf.
 * The DIRECT path's chain validates no content — it merkle-binds attestations
 * and content-hash-binds the evidence; well-formedness there is this layer's
 * job + a read-time concern.
 *
 * The format is a closed subset of JSON Schema: small and predictable. A spec
 * is DATA (a JSON file in `clauses/`, anchored on `ClauseRegistry` → IPFS),
 * never code — a new clause adds a spec, not a code path.
 */

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

export interface BaseFieldSpec {
    name: string;
    required: boolean;
    description?: string;
    /** Build/UI default applied when the composing input omits this field.
     *  Purely composition metadata — the ABI encoder ignores it (an absent
     *  optional still encodes as the ABI zero-value), so Layers B/C are
     *  unaffected. Shape must match the field type (validated at parse). */
    default?: string | number | boolean | readonly string[];
    /** Human display label for this field. Purely cosmetic UI metadata —
     *  nothing on-chain reads it (like `block`), so it is a
     *  Layer-A-only field. Lets every render surface (drawer, canvas, checkout,
     *  analysis) name the field from the spec; absent → callers fall back to
     *  the field `name`. */
    label?: string;
}

export interface StringFieldSpec extends BaseFieldSpec {
    type: "string";
    format?: StringFormat;
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
     *  (conventionally index 0, e.g. klerosCourt "none"). It exists so the
     *  wire encoding keeps its historical 1-based semantics; it is never a
     *  valid composition input, and generic input surfaces exclude it. */
    sentinel?: string;
    /** Per-value human display labels (value → label), e.g.
     *  `{ "zone-wifi": "Same Wi-Fi network" }`. Purely cosmetic Layer-A
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

export interface ClauseSpec {
    /** The bare human-readable clause name (e.g. `figaro-emissions`) — no version
     *  suffix. The on-chain identity key is `keccak256(abi.encode(clauseId, version))`
     *  (see `ClauseRegistry.registerClause`), so name + version together form it. */
    clauseId: string;
    /** Clause version — a separate field, never embedded in `clauseId`. Folded
     *  into the on-chain key alongside `clauseId`. */
    version: number;
    /** Display title. */
    title: string;
    /** Prose description. */
    description: string;
    /** Default field shape; applies to all stages unless a stage override is set. */
    fields: readonly FieldSpec[];
    /** Optional per-stage overrides. Keyed by stage number (matches AttestationCoordinator stage uint8). */
    stages?: Readonly<Record<number, readonly FieldSpec[]>>;
    // The `block` slice of the spec JSON (designer/runtime composition metadata)
    // is NOT parsed here — it's pure presentation the SDK never reads. The
    // frontend parses it off the same JSON (`lib/shared/clauseBlockBinding`).
    // AUTHORS: the on-chain `contentHash` covers the RAW canonical document
    // including `block` — pin and hash the raw JSON; re-serializing the parsed
    // spec would silently drop `block` and change the hash.
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
 *  and padded whitespace) — the spec's contract is "decimal string", and the
 *  prover's Rust mirror enforces the same grammar in lockstep. */
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
            return typeof value === "number" && Number.isInteger(value)
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
 *  that live outside a clause's content — e.g. the frontend's `block.fields`
 *  (a composition's runtime-input fields). Pushes `SpecParseError`s on `errors`
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
    return spec;
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
            if (raw.minLength !== undefined) {
                if (typeof raw.minLength !== "number" || !Number.isInteger(raw.minLength) || raw.minLength < 0) {
                    errors.push({ path: `${path}.minLength`, message: "minLength must be a non-negative integer" });
                    return null;
                }
                spec.minLength = raw.minLength;
            }
            if (raw.maxLength !== undefined) {
                if (typeof raw.maxLength !== "number" || !Number.isInteger(raw.maxLength) || raw.maxLength < 0) {
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
                try { new RegExp(raw.pattern); } catch {
                    errors.push({ path: `${path}.pattern`, message: "pattern must be a valid regex" });
                    return null;
                }
                spec.pattern = raw.pattern;
            }
            return spec;
        }
        case "integer": {
            const spec: IntegerFieldSpec = { ...base, type: "integer" };
            if (raw.min !== undefined) {
                if (typeof raw.min !== "number" || !Number.isInteger(raw.min)) {
                    errors.push({ path: `${path}.min`, message: "min must be an integer" });
                    return null;
                }
                spec.min = raw.min;
            }
            if (raw.max !== undefined) {
                if (typeof raw.max !== "number" || !Number.isInteger(raw.max)) {
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
                if (typeof raw.minItems !== "number" || !Number.isInteger(raw.minItems) || raw.minItems < 0) {
                    errors.push({ path: `${path}.minItems`, message: "minItems must be a non-negative integer" });
                    return null;
                }
                spec.minItems = raw.minItems;
            }
            if (raw.maxItems !== undefined) {
                if (typeof raw.maxItems !== "number" || !Number.isInteger(raw.maxItems) || raw.maxItems < 0) {
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

/**
 * Parse and validate an unknown value as a ClauseSpec. Validates the
 * meta-clause (the structure of the spec itself, not any content).
 */
export function parseClauseSpec(raw: unknown): ParseClauseSpecResult {
    const errors: SpecParseError[] = [];
    if (!isObject(raw)) {
        return { ok: false, errors: [{ path: "$", message: "clause spec must be an object" }] };
    }
    const { clauseId, version, title, description, fields, stages } = raw;
    if (typeof clauseId !== "string" || clauseId.length === 0) {
        errors.push({ path: "$.clauseId", message: "clauseId must be a non-empty string" });
    }
    if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
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
    let parsedStages: Record<number, readonly FieldSpec[]> | undefined;
    if (stages !== undefined) {
        if (!isObject(stages)) {
            errors.push({ path: "$.stages", message: "stages must be an object keyed by stage number" });
        } else {
            parsedStages = {};
            for (const [key, value] of Object.entries(stages)) {
                const stageNum = Number(key);
                if (!Number.isInteger(stageNum) || stageNum < 0 || stageNum > 255) {
                    errors.push({ path: `$.stages.${key}`, message: "stage key must be an integer 0..255" });
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
                parsedStages[stageNum] = stageFields;
            }
        }
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
        },
    };
}
