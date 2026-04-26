/**
 * Content validator — validates a content value against a parsed SchemaSpec.
 *
 * Call sites: frontend form gates, SDK agent-action preflight, later mirrored
 * in the on-chain JSONSchemaValidator contract and the SP1 prover.
 */

import type {
    SchemaSpec,
    FieldSpec,
    StringFieldSpec,
    IntegerFieldSpec,
    BigintFieldSpec,
    EnumFieldSpec,
    ArrayFieldSpec,
    ObjectFieldSpec,
} from "./spec.js";

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

const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_HEX_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES_HEX_RE = /^0x([0-9a-fA-F]{2})*$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateString(value: unknown, spec: StringFieldSpec, path: string, errors: ValidationError[]): void {
    if (typeof value !== "string") {
        errors.push({ path, message: `expected string, got ${typeof value}` });
        return;
    }
    if (spec.minLength !== undefined && value.length < spec.minLength) {
        errors.push({ path, message: `string shorter than minLength ${spec.minLength}` });
    }
    if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        errors.push({ path, message: `string longer than maxLength ${spec.maxLength}` });
    }
    if (spec.pattern !== undefined) {
        const re = new RegExp(spec.pattern);
        if (!re.test(value)) {
            errors.push({ path, message: `string does not match pattern ${spec.pattern}` });
        }
    }
    if (spec.format !== undefined) {
        const matches =
            spec.format === "bytes32-hex" ? BYTES32_HEX_RE.test(value) :
            spec.format === "address-hex" ? ADDRESS_HEX_RE.test(value) :
            spec.format === "bytes-hex" ? BYTES_HEX_RE.test(value) :
            spec.format === "iso-datetime" ? ISO_DATETIME_RE.test(value) :
            false;
        if (!matches) {
            errors.push({ path, message: `string does not match format ${spec.format}` });
        }
    }
}

function validateInteger(value: unknown, spec: IntegerFieldSpec, path: string, errors: ValidationError[]): void {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push({ path, message: `expected integer, got ${typeof value}` });
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
    let parsed: bigint;
    try { parsed = BigInt(value); } catch {
        errors.push({ path, message: `value "${value}" does not parse as BigInt` });
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

function validateArray(value: unknown, spec: ArrayFieldSpec, path: string, errors: ValidationError[]): void {
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
    for (let i = 0; i < value.length; i++) {
        validateField(value[i], spec.items, `${path}[${i}]`, errors);
    }
}

function validateObject(value: unknown, spec: ObjectFieldSpec, path: string, errors: ValidationError[]): void {
    if (!isObject(value)) {
        errors.push({ path, message: `expected object, got ${typeof value}` });
        return;
    }
    const known = new Set<string>();
    for (const field of spec.fields) {
        known.add(field.name);
        const childPath = path === "$" ? `$.${field.name}` : `${path}.${field.name}`;
        const childValue = value[field.name];
        if (childValue === undefined) {
            if (field.required) {
                errors.push({ path: childPath, message: `required field "${field.name}" is missing` });
            }
            continue;
        }
        validateField(childValue, field, childPath, errors);
    }
    // Reject unknown fields — schema is a closed contract.
    for (const key of Object.keys(value)) {
        if (!known.has(key)) {
            const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
            errors.push({ path: childPath, message: `unknown field "${key}" not declared in schema` });
        }
    }
}

function validateField(value: unknown, spec: FieldSpec, path: string, errors: ValidationError[]): void {
    switch (spec.type) {
        case "string": validateString(value, spec, path, errors); return;
        case "integer": validateInteger(value, spec, path, errors); return;
        case "bigint": validateBigint(value, spec, path, errors); return;
        case "boolean":
            if (typeof value !== "boolean") {
                errors.push({ path, message: `expected boolean, got ${typeof value}` });
            }
            return;
        case "enum": validateEnum(value, spec, path, errors); return;
        case "array": validateArray(value, spec, path, errors); return;
        case "object": validateObject(value, spec, path, errors); return;
    }
}

/**
 * Validate content against a SchemaSpec. If `options.stage` is set and the
 * spec defines a matching stage override, those fields are used; otherwise
 * the spec's default `fields` apply.
 */
export function validateContent(
    content: unknown,
    spec: SchemaSpec,
    options: ValidateOptions = {},
): ValidationResult {
    const fields: readonly FieldSpec[] =
        options.stage !== undefined && spec.stages?.[options.stage] !== undefined
            ? spec.stages[options.stage]
            : spec.fields;
    const errors: ValidationError[] = [];
    // Treat the root content as a pseudo-object with the spec's top-level fields.
    const rootSpec: ObjectFieldSpec = { name: "$", required: true, type: "object", fields };
    validateObject(content, rootSpec, "$", errors);
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
