/**
 * Figaro clause-spec format — single source of truth for clause-content
 * validation across three layers:
 *   1. Client-side validator (this module)
 *   2. On-chain per-clause validator contract (Solidity, future)
 *   3. SP1 prover (Rust mirror, future)
 *
 * The format is a closed subset of JSON Schema. Small, predictable, and
 * designed to be mirrored faithfully in Rust without ambiguity.
 *
 * Validators in all three layers MUST agree on interpretation. If you
 * extend this format, update the meta-clause parser, the contract, and
 * the prover in lockstep.
 */

export type FieldType =
    | "string"
    | "integer"
    | "bigint"
    | "boolean"
    | "enum"
    | "array"
    | "object";

export type StringFormat =
    | "bytes32-hex"
    | "address-hex"
    | "bytes-hex"
    | "iso-datetime";

export interface BaseFieldSpec {
    name: string;
    required: boolean;
    description?: string;
    /** Build/UI default applied when the composing input omits this field.
     *  Purely composition metadata — the ABI encoder ignores it (an absent
     *  optional still encodes as the ABI zero-value), so Layers B/C are
     *  unaffected. Shape must match the field type (validated at parse). */
    default?: string | number | boolean | readonly string[];
    /** Human display label for this field. Purely cosmetic UI metadata — the
     *  on-chain validator + Rust prover ignore it (like `block`), so it is a
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
     *  metadata the validator/prover ignore; a render surface labels the
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

/** Drawer article a clause composes into on the designer canvas. A free-form
 *  string read straight from the spec — the set of articles and their grouping
 *  are whatever the registered clauses declare, never a closed list. */
export type ClauseArticle = string;

/** Doctrinal tier per the protocol-extension doctrine. Independent of the
 *  designer-palette category (`BlockMetadata.category`); the two used to be
 *  both called "category" and got conflated. Now renamed. */
export type ClauseTier = "runtime" | "cross-checked" | "agreement-only";

/**
 * Block-binding metadata — the single source of truth for how a clause
 * composes into the UI. Replaces the hand-maintained CLAUSE_OWNERSHIP map
 * and the clauseIds field on BlockMetadata, both of which were redundant
 * with each other and had drifted out of sync.
 *
 * Each clause declares its own binding here. Consumers:
 *   - Designer drawer (which article composes this clause)
 *   - Canvas → assembly derivation (which mechanism kinds + module IDs
 *     to include when this clause is anchored in an order)
 *   - Runtime composer (which modules to mount per anchored clause)
 *   - Route-tier surfaces (which routes surface this clause)
 *
 * The on-chain validator + Rust prover ignore this field — it's purely
 * UI/composition metadata.
 */
export interface ClauseBlockBinding {
    /** Doctrinal tier. */
    tier: ClauseTier;
    /** Drawer article that composes this clause in the canvas designer.
     *  Undefined when the clause is runtime-only (runtime sister of a
     *  cross-checked clause) and not user-toggleable. */
    article?: ClauseArticle;
    /** Mechanism kinds an assembly should include when this clause is
     *  anchored in any of its orders. Empty when the clause has no
     *  capability-dispatching mechanism (e.g. consent, jurisdiction). */
    mechanismKinds: readonly string[];
    /** Runtime view-tier modules that consume / produce this clause's
     *  data. Empty when the clause is route-tier only. */
    moduleIds: readonly string[];
    /** Route-tier blocks that surface this clause (e.g. ["/dispute",
     *  "/evidence-display"]). Empty when the clause is view-tier only or
     *  has no UI at all. */
    routes?: readonly string[];
    /** The clause's runtime-attestation companion — the runtime clause
     *  paired with this one. The agreement build emits it as an empty anchor
     *  (its content is attested at runtime, not composed). N cross-checked clauses
     *  MAY name the same runtime companion (e.g. the GHG disclosure clauses →
     *  figaro-ghg-measurement-v1); the emitter dedups. Omit for unsistered
     *  clauses. */
    sisterClauseId?: string;
    /** The FIELD name (on another, parent clause) this clause nests under in the
     *  designer drawer — a containment relationship read from the spec, never a
     *  hardcoded tree. The drawer renders this clause nested beneath the parent
     *  clause's matching field (e.g. figaro-proximity-policy-v1 nests under the
     *  hand-off clause's `handoff` field). Omit for top-level clauses. */
    nestsUnder?: string;
    /** Structural clause — composed on EVERY order by the agreement build, not a
     *  designer choice (figaro-commerce-v1, figaro-topology-v1). Generic surfaces
     *  read this to exclude it from selectable lists (the drawer never offers a
     *  structural clause as a checkbox). Omit for elective clauses. */
    structural?: boolean;
    /** Default-on clause — pre-composed (as an empty object the spec's field
     *  `default`s fill at build) on every freshly-spawned designer node, a
     *  deliberate analytics default the author can remove in the drawer (unlike
     *  `structural`, which is never offered). Generic surfaces compose the set
     *  by reading this flag; no code names the clauses. Omit for elective
     *  clauses. */
    defaultOn?: boolean;
    /** WHO attests this runtime clause: "seller" (the order's seller
     *  — the default for lifecycle clauses like merchant/courier process) or
     *  "bilateral" (BOTH buyer and seller witness — e.g. the proximity proof of
     *  physical presence). The generic runtime capability engine reads this to
     *  surface the attestation to the right party/parties, with no clause names in
     *  the engine. Omit for non-attestable clauses. */
    attestation?: "seller" | "bilateral";
    /** Enum stage CODES of this lifecycle clause's ladder that are PHYSICAL
     *  HAND-OFFS — the moments value changes hands (e.g. merchant-process
     *  `handed-off`; courier-process `arrived-pickup`/`arrived-dropoff`). At such
     *  a stage the generic engine pairs a proximity cross-witness: the attesting
     *  seller also signs the proximity proof on whichever order in the process
     *  carries it (its own, or — across the topology edge — the counterparty's),
     *  so both sides of the hand-off witness the same proof. Distinct from
     *  `attestation` (who) — this is WHICH stages are hand-offs. Omit for clauses
     *  with no physical exchange. */
    handoffStages?: readonly string[];
}

export interface ClauseSpec {
    /** Human-readable clause name. keccak256(clauseId) is the on-chain bytes32. */
    clauseId: string;
    /** Clause version. Should match the vN suffix in clauseId. */
    version: number;
    /** Display title. */
    title: string;
    /** Prose description. */
    description: string;
    /** Optional discovery categories — open taxonomy used by builder/browser surfaces to filter clauses by topic (e.g. "emissions", "geo", "lifecycle"). Not enforcement metadata. */
    categories?: readonly string[];
    /** Default field shape; applies to all stages unless a stage override is set. */
    fields: readonly FieldSpec[];
    /** Optional per-stage overrides. Keyed by stage number (matches AttestationCoordinator stage uint8). */
    stages?: Readonly<Record<number, readonly FieldSpec[]>>;
    /** Block-binding metadata for the designer + runtime composer. See
     *  ClauseBlockBinding. Optional only for forward-compat with external
     *  clauses; every protocol clause declares it. */
    block?: ClauseBlockBinding;
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

const VALID_STRING_FORMATS: ReadonlySet<string> = new Set([
    "bytes32-hex", "address-hex", "bytes-hex", "iso-datetime",
]);

const VALID_CLAUSE_TIERS: ReadonlySet<string> = new Set([
    "runtime", "cross-checked", "agreement-only",
]);

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
            if (typeof value !== "string") return false;
            try { BigInt(value); } catch { return false; }
            return true;
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

function parseFieldSpec(raw: unknown, path: string, errors: SpecParseError[]): FieldSpec | null {
    const spec = parseFieldSpecCore(raw, path, errors);
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

function parseFieldSpecCore(raw: unknown, path: string, errors: SpecParseError[]): FieldSpec | null {
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
                if (typeof raw.format !== "string" || !VALID_STRING_FORMATS.has(raw.format)) {
                    errors.push({ path: `${path}.format`, message: `format must be one of: ${[...VALID_STRING_FORMATS].join(", ")}` });
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
                try { BigInt(v); } catch {
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
            const items = parseFieldSpec({ ...raw.items, name: "*", required: true }, `${path}.items`, errors);
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
                const child = parseFieldSpec(raw.fields[i], `${path}.fields[${i}]`, errors);
                if (child !== null) fields.push(child);
            }
            return { ...base, type: "object", fields };
        }
    }
    return null;
}

function parseStringArray(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): readonly string[] | null {
    if (!Array.isArray(raw)) {
        errors.push({ path, message: "expected an array of strings" });
        return null;
    }
    for (let i = 0; i < raw.length; i++) {
        if (typeof raw[i] !== "string" || raw[i].length === 0) {
            errors.push({ path: `${path}[${i}]`, message: "expected a non-empty string" });
            return null;
        }
    }
    return raw as string[];
}

function parseBlockBinding(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): ClauseBlockBinding | null {
    if (!isObject(raw)) {
        errors.push({ path, message: "block binding must be an object" });
        return null;
    }
    const tier = raw.tier;
    if (typeof tier !== "string" || !VALID_CLAUSE_TIERS.has(tier)) {
        errors.push({ path: `${path}.tier`, message: `tier must be one of: ${[...VALID_CLAUSE_TIERS].join(", ")}` });
        return null;
    }
    if (raw.article !== undefined) {
        if (typeof raw.article !== "string" || raw.article.length === 0) {
            errors.push({ path: `${path}.article`, message: "article must be a non-empty string when present" });
            return null;
        }
    }
    const mechanismKinds = parseStringArray(raw.mechanismKinds, `${path}.mechanismKinds`, errors);
    if (mechanismKinds === null) return null;
    const moduleIds = parseStringArray(raw.moduleIds, `${path}.moduleIds`, errors);
    if (moduleIds === null) return null;
    let routes: readonly string[] | undefined;
    if (raw.routes !== undefined) {
        const r = parseStringArray(raw.routes, `${path}.routes`, errors);
        if (r === null) return null;
        routes = r;
    }
    if (raw.sisterClauseId !== undefined) {
        if (typeof raw.sisterClauseId !== "string" || raw.sisterClauseId.length === 0) {
            errors.push({ path: `${path}.sisterClauseId`, message: "sisterClauseId must be a non-empty string when present" });
            return null;
        }
    }
    if (raw.nestsUnder !== undefined) {
        if (typeof raw.nestsUnder !== "string" || raw.nestsUnder.length === 0) {
            errors.push({ path: `${path}.nestsUnder`, message: "nestsUnder must be a non-empty string when present" });
            return null;
        }
    }
    if (raw.structural !== undefined && typeof raw.structural !== "boolean") {
        errors.push({ path: `${path}.structural`, message: "structural must be a boolean when present" });
        return null;
    }
    if (raw.defaultOn !== undefined && typeof raw.defaultOn !== "boolean") {
        errors.push({ path: `${path}.defaultOn`, message: "defaultOn must be a boolean when present" });
        return null;
    }
    if (raw.attestation !== undefined && raw.attestation !== "seller" && raw.attestation !== "bilateral") {
        errors.push({ path: `${path}.attestation`, message: "attestation must be 'seller' or 'bilateral' when present" });
        return null;
    }
    let handoffStages: readonly string[] | undefined;
    if (raw.handoffStages !== undefined) {
        const h = parseStringArray(raw.handoffStages, `${path}.handoffStages`, errors);
        if (h === null) return null;
        handoffStages = h;
    }
    return {
        tier: tier as ClauseTier,
        ...(raw.article !== undefined && { article: raw.article as ClauseArticle }),
        mechanismKinds,
        moduleIds,
        ...(routes !== undefined && { routes }),
        ...(raw.sisterClauseId !== undefined && { sisterClauseId: raw.sisterClauseId as string }),
        ...(raw.nestsUnder !== undefined && { nestsUnder: raw.nestsUnder as string }),
        ...(raw.structural !== undefined && { structural: raw.structural as boolean }),
        ...(raw.defaultOn !== undefined && { defaultOn: raw.defaultOn as boolean }),
        ...(raw.attestation !== undefined && { attestation: raw.attestation as "seller" | "bilateral" }),
        ...(handoffStages !== undefined && { handoffStages }),
    };
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
    const { clauseId, version, title, description, categories, fields, stages, block } = raw;
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
    let parsedCategories: readonly string[] | undefined;
    if (categories !== undefined) {
        if (!Array.isArray(categories)) {
            errors.push({ path: "$.categories", message: "categories must be an array of strings" });
        } else {
            const bad = categories.findIndex((c) => typeof c !== "string" || c.length === 0);
            if (bad >= 0) {
                errors.push({ path: `$.categories[${bad}]`, message: "category must be a non-empty string" });
            } else {
                parsedCategories = categories as string[];
            }
        }
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
    let parsedBlock: ClauseBlockBinding | undefined;
    if (block !== undefined) {
        const b = parseBlockBinding(block, "$.block", errors);
        if (b !== null) parsedBlock = b;
    }
    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        spec: {
            clauseId: clauseId as string,
            version: version as number,
            title: title as string,
            description: description as string,
            ...(parsedCategories !== undefined && { categories: parsedCategories }),
            fields: parsedFields,
            ...(parsedStages !== undefined && { stages: parsedStages }),
            ...(parsedBlock !== undefined && { block: parsedBlock }),
        },
    };
}
