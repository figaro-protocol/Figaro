/**
 * Figaro schema-spec format — single source of truth for schema-content
 * validation across three layers:
 *   1. Client-side validator (this module)
 *   2. On-chain per-schema validator contract (Solidity, future)
 *   3. SP1 prover (Rust mirror, future)
 *
 * The format is a closed subset of JSON Schema. Small, predictable, and
 * designed to be mirrored faithfully in Rust without ambiguity.
 *
 * Validators in all three layers MUST agree on interpretation. If you
 * extend this format, update the meta-schema parser, the contract, and
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

/** Drawer article a schema composes into on the designer canvas. */
export type SchemaDrawerArticle =
    | "identity"
    | "order"
    | "fulfilment"
    | "logistics"
    | "attestations"
    | "emissions"
    | "dispute-resolution"
    | "consent";

/** Doctrinal tier per the protocol-extension doctrine. Independent of the
 *  designer-palette category (`BlockMetadata.category`); the two used to be
 *  both called "category" and got conflated. Now renamed. */
export type SchemaTier = "category-1" | "category-2" | "manifest-only";

/**
 * Block-binding metadata — the single source of truth for how a schema
 * composes into the UI. Replaces the hand-maintained SCHEMA_OWNERSHIP map
 * and the schemaIds field on BlockMetadata, both of which were redundant
 * with each other and had drifted out of sync.
 *
 * Each schema declares its own binding here. Consumers:
 *   - Designer drawer (which article composes this schema)
 *   - Canvas → assembly derivation (which mechanism kinds + module IDs
 *     to include when this schema is anchored in an order)
 *   - Runtime composer (which modules to mount per anchored schema)
 *   - Route-tier surfaces (which routes surface this schema)
 *
 * The on-chain validator + Rust prover ignore this field — it's purely
 * UI/composition metadata.
 */
export interface SchemaBlockBinding {
    /** Doctrinal tier. */
    tier: SchemaTier;
    /** Drawer article that composes this schema in the canvas designer.
     *  Undefined when the schema is runtime-only (Category-1 sister of a
     *  Category-2 clause) and not user-toggleable. */
    drawerArticle?: SchemaDrawerArticle;
    /** Mechanism kinds an assembly should include when this schema is
     *  anchored in any of its orders. Empty when the schema has no
     *  capability-dispatching mechanism (e.g. consent, jurisdiction). */
    mechanismKinds: readonly string[];
    /** Runtime view-tier modules that consume / produce this schema's
     *  data. Empty when the schema is route-tier only. */
    moduleIds: readonly string[];
    /** Route-tier blocks that surface this schema (e.g. ["/dispute",
     *  "/evidence-display"]). Empty when the schema is view-tier only or
     *  has no UI at all. */
    routes?: readonly string[];
    /** Sister schema in a Category-1 ↔ Category-2 pair. Omit for
     *  unsisters and for one-to-many runtime sisters. */
    sisterSchemaId?: string;
}

export interface SchemaSpec {
    /** Human-readable schema name. keccak256(schemaId) is the on-chain bytes32. */
    schemaId: string;
    /** Schema version. Should match the vN suffix in schemaId. */
    version: number;
    /** Display title. */
    title: string;
    /** Prose description. */
    description: string;
    /** Optional discovery categories — open taxonomy used by builder/browser surfaces to filter schemas by topic (e.g. "emissions", "geo", "lifecycle"). Not enforcement metadata. */
    categories?: readonly string[];
    /** Default field shape; applies to all stages unless a stage override is set. */
    fields: readonly FieldSpec[];
    /** Optional per-stage overrides. Keyed by stage number (matches AttestationCoordinator stage uint8). */
    stages?: Readonly<Record<number, readonly FieldSpec[]>>;
    /** Block-binding metadata for the designer + runtime composer. See
     *  SchemaBlockBinding. Optional only for forward-compat with external
     *  schemas; every protocol schema declares it. */
    block?: SchemaBlockBinding;
}

export interface SpecParseError {
    /** JSON-pointer-style path to the problem location. */
    path: string;
    message: string;
}

export type ParseSchemaSpecResult =
    | { ok: true; spec: SchemaSpec }
    | { ok: false; errors: SpecParseError[] };

const VALID_FIELD_TYPES: ReadonlySet<string> = new Set([
    "string", "integer", "bigint", "boolean", "enum", "array", "object",
]);

const VALID_STRING_FORMATS: ReadonlySet<string> = new Set([
    "bytes32-hex", "address-hex", "bytes-hex", "iso-datetime",
]);

const VALID_DRAWER_ARTICLES: ReadonlySet<string> = new Set([
    "identity", "order", "fulfilment", "logistics",
    "attestations", "emissions", "dispute-resolution", "consent",
]);

const VALID_SCHEMA_TIERS: ReadonlySet<string> = new Set([
    "category-1", "category-2", "manifest-only",
]);

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseFieldSpec(raw: unknown, path: string, errors: SpecParseError[]): FieldSpec | null {
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
    const type = raw.type;
    if (typeof type !== "string" || !VALID_FIELD_TYPES.has(type)) {
        errors.push({ path: `${path}.type`, message: `type must be one of: ${[...VALID_FIELD_TYPES].join(", ")}` });
        return null;
    }
    const base: BaseFieldSpec = { name, required, ...(description !== undefined && { description }) };

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
            return { ...base, type: "enum", values: raw.values as readonly string[] };
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
): SchemaBlockBinding | null {
    if (!isObject(raw)) {
        errors.push({ path, message: "block binding must be an object" });
        return null;
    }
    const tier = raw.tier;
    if (typeof tier !== "string" || !VALID_SCHEMA_TIERS.has(tier)) {
        errors.push({ path: `${path}.tier`, message: `tier must be one of: ${[...VALID_SCHEMA_TIERS].join(", ")}` });
        return null;
    }
    if (raw.drawerArticle !== undefined) {
        if (typeof raw.drawerArticle !== "string" || !VALID_DRAWER_ARTICLES.has(raw.drawerArticle)) {
            errors.push({ path: `${path}.drawerArticle`, message: `drawerArticle must be one of: ${[...VALID_DRAWER_ARTICLES].join(", ")}` });
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
    if (raw.sisterSchemaId !== undefined) {
        if (typeof raw.sisterSchemaId !== "string" || raw.sisterSchemaId.length === 0) {
            errors.push({ path: `${path}.sisterSchemaId`, message: "sisterSchemaId must be a non-empty string when present" });
            return null;
        }
    }
    return {
        tier: tier as SchemaTier,
        ...(raw.drawerArticle !== undefined && { drawerArticle: raw.drawerArticle as SchemaDrawerArticle }),
        mechanismKinds,
        moduleIds,
        ...(routes !== undefined && { routes }),
        ...(raw.sisterSchemaId !== undefined && { sisterSchemaId: raw.sisterSchemaId as string }),
    };
}

/**
 * Parse and validate an unknown value as a SchemaSpec. Validates the
 * meta-schema (the structure of the spec itself, not any content).
 */
export function parseSchemaSpec(raw: unknown): ParseSchemaSpecResult {
    const errors: SpecParseError[] = [];
    if (!isObject(raw)) {
        return { ok: false, errors: [{ path: "$", message: "schema spec must be an object" }] };
    }
    const { schemaId, version, title, description, categories, fields, stages, block } = raw;
    if (typeof schemaId !== "string" || schemaId.length === 0) {
        errors.push({ path: "$.schemaId", message: "schemaId must be a non-empty string" });
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
    let parsedBlock: SchemaBlockBinding | undefined;
    if (block !== undefined) {
        const b = parseBlockBinding(block, "$.block", errors);
        if (b !== null) parsedBlock = b;
    }
    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        spec: {
            schemaId: schemaId as string,
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
