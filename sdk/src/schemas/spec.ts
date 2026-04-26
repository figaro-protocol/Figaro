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

/**
 * Parse and validate an unknown value as a SchemaSpec. Validates the
 * meta-schema (the structure of the spec itself, not any content).
 */
export function parseSchemaSpec(raw: unknown): ParseSchemaSpecResult {
    const errors: SpecParseError[] = [];
    if (!isObject(raw)) {
        return { ok: false, errors: [{ path: "$", message: "schema spec must be an object" }] };
    }
    const { schemaId, version, title, description, categories, fields, stages } = raw;
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
        },
    };
}
