/**
 * lib/shared/parseHelpers.ts
 *
 * Shared validation primitives used across every strict JSON parser in
 * `lib/shared/`. Five parsers (`runtimeIdentityParser`,
 * `sellerCatalogueMetadataParser`, `operatorProfileMetadata`,
 * `assemblyParser`, `runtimeIdentityDocument`) previously each carried
 * their own line-for-line copies of these helpers; this module is the
 * single source.
 *
 * Each helper raises `Error(`<path> must be …`)` on failure, where
 * `path` is a JSON-pointer-style breadcrumb passed by the caller. Use
 * the descriptive form (`asString(record.foo, sourceLabel + ".foo")`)
 * so error messages localise the failure for the user.
 */

import { isValidAddress } from "@/components/operators/TokenAddressInput";

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path} must be an object.`);
    }
    return value as UnknownRecord;
}

export function asString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw new Error(`${path} must be a string.`);
    }
    return value;
}

export function asOptionalString(value: unknown, path: string): string | undefined {
    if (value === undefined) return undefined;
    return asString(value, path);
}

export function asBoolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
        throw new Error(`${path} must be a boolean.`);
    }
    return value;
}

export function asNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`${path} must be a number.`);
    }
    return value;
}

export function asArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value;
}

export function asStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }
    return value.map((entry, index) => asString(entry, `${path}[${index}]`));
}

export function asEnum<T extends string>(value: unknown, allowed: Set<T>, path: string): T {
    const stringValue = asString(value, path);
    if (!allowed.has(stringValue as T)) {
        throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
    }
    return stringValue as T;
}

export function asAddress(value: unknown, path: string): `0x${string}` {
    const address = asString(value, path);
    if (!isValidAddress(address)) {
        throw new Error(`${path} must be a 20-byte hex address.`);
    }
    return address as `0x${string}`;
}

export function asOptionalAddress(value: unknown, path: string): `0x${string}` | undefined {
    if (value === undefined) return undefined;
    return asAddress(value, path);
}
