/**
 * Generic, spec-driven content encoder. ONE encoder drives EVERY clause:
 * a new clause plugs in by declaring its spec (`clauses/<id>.json`, anchored
 * on `ClauseRegistry`) — no encoder code, and no per-clause types, live here.
 * The encoder has zero prior knowledge of any clause; it reads the parsed
 * `ClauseSpec` at runtime and applies the canonical ABI mapping:
 *
 *   - top-level fields encode as `encodeAbiParameters` in declaration order
 *   - `boolean` → `bool`
 *   - `integer` / `bigint` → `uint256` (width is encode-irrelevant)
 *   - `enum` → `uint8` = 0-based position in `EnumFieldSpec.values`
 *   - `string` (no format) → `string`
 *   - `string` `bytes32-hex` → `bytes32`
 *   - `string` `address-hex` → `address`
 *   - `string` `bytes-hex` → `bytes`
 *   - `array<T>` → `T[]` (element type mapped recursively)
 *   - `object` → `tuple(...)` of its fields, declaration order
 *
 * Absent optional fields encode as the ABI zero-value of their type
 * (`0`, `""`, `false`, empty array, zero-bytes). A required absent
 * field throws (caller-detectable; validation should already have
 * caught it upstream).
 */

import { encodeAbiParameters, type AbiParameter, type Hex } from "viem";
import type { FieldSpec, ClauseSpec } from "./spec.js";

// ── Empty content (some clauses accept empty bytes) ─────────────────────────

export const EMPTY_CONTENT: Hex = "0x";

// ── Generic spec-driven encoder ─────────────────────────────────────────────

/** The viem ABI-parameter descriptor for a spec field. */
function abiParamOf(field: FieldSpec): AbiParameter {
    switch (field.type) {
        case "boolean":
            return { type: "bool" };
        case "integer":
        case "bigint":
            return { type: "uint256" };
        case "enum":
            return { type: "uint8" };
        case "string":
            switch (field.format) {
                case "bytes32-hex": return { type: "bytes32" };
                case "address-hex": return { type: "address" };
                case "bytes-hex": return { type: "bytes" };
                default: return { type: "string" };
            }
        case "array": {
            const inner = abiParamOf(field.items);
            return { ...inner, type: `${inner.type}[]` };
        }
        case "object":
            return { type: "tuple", components: field.fields.map(abiParamOf) };
    }
}

/** The ABI zero-value for an absent optional field, by type. */
function zeroValueOf(field: FieldSpec): unknown {
    switch (field.type) {
        case "boolean":
            return false;
        case "integer":
        case "bigint":
        case "enum":
            return 0n;
        case "string":
            switch (field.format) {
                case "bytes32-hex": return `0x${"0".repeat(64)}`;
                case "address-hex": return `0x${"0".repeat(40)}`;
                case "bytes-hex": return "0x";
                default: return "";
            }
        case "array":
            return [];
        case "object":
            return field.fields.map(zeroValueOf);
    }
}

/** The viem value for a spec field given its raw JSON value (or absence). */
function abiValueOf(field: FieldSpec, raw: unknown): unknown {
    if (raw === undefined || raw === null) {
        if (field.required) {
            throw new Error(`field ${field.name}: required field is absent`);
        }
        return zeroValueOf(field);
    }
    switch (field.type) {
        case "boolean":
            return Boolean(raw);
        // Encoding does not distinguish `integer` from `bigint` — both are a
        // 32-byte word. Content may arrive as a JSON number or, for values
        // outside JSON's safe integer range, a decimal string.
        case "integer":
        case "bigint":
            return BigInt(raw as string | number | bigint);
        case "enum": {
            const idx = field.values.indexOf(raw as string);
            if (idx < 0) {
                throw new Error(
                    `field ${field.name}: "${String(raw)}" is not a declared enum value`,
                );
            }
            return BigInt(idx);
        }
        case "string":
            return raw;
        case "array":
            return (raw as unknown[]).map((item) => abiValueOf(field.items, item));
        case "object": {
            const obj = raw as Record<string, unknown>;
            return field.fields.map((sub) => abiValueOf(sub, obj[sub.name]));
        }
    }
}

export interface EncodeOptions {
    /** If set and the spec has a matching `stages[stage]`, encode against
     *  those fields — the same selection `validateContent` applies. */
    stage?: number;
}

/**
 * Encode JSON content to canonical ABI bytes from the parsed `ClauseSpec`
 * alone — no clause-specific code path. If `options.stage` is set and the
 * spec defines a matching stage override, that stage's fields drive the
 * encoding (a runtime witness whose content differs from the committed
 * content); otherwise the spec's default `fields` apply.
 */
export function encodeContentFromSpec(
    spec: ClauseSpec,
    content: Record<string, unknown>,
    options: EncodeOptions = {},
): Hex {
    const fields: readonly FieldSpec[] =
        options.stage !== undefined && spec.stages?.[options.stage] !== undefined
            ? spec.stages[options.stage]
            : spec.fields;
    const params = fields.map(abiParamOf);
    const values = fields.map((field) => abiValueOf(field, content[field.name]));
    return encodeAbiParameters(params, values as never);
}
