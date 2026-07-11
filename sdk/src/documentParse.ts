/**
 * documentParse.ts — strict validation primitives for the seller-family
 * off-chain document parsers (`sellerProfile.ts`, `sellerCatalogue.ts`).
 *
 * These are the SDK-local copies of the `as*` primitives (the frontend
 * keeps its own `frontend/lib/seller/parseHelpers.ts` for its non-seller
 * parsers). The SDK is a standalone package whose only runtime dependency
 * is `viem`, so it cannot import the frontend leaf; address validity is
 * checked with viem's `isAddress` in the same non-strict mode the frontend
 * uses (format-only: accepts lowercase, valid checksum, and
 * mixed-case-with-bad-checksum). Error messages are byte-identical to the
 * frontend primitives so a document that parsed there parses here.
 *
 * Each helper raises `Error("<path> must be …")` on failure, where `path`
 * is a JSON-pointer-style breadcrumb passed by the caller.
 */

import { isAddress } from "viem";

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

function asNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`${path} must be a number.`);
    }
    return value;
}

/** `asNumber`, but `undefined` passes through. */
export function asOptionalNumber(value: unknown, path: string): number | undefined {
    if (value === undefined) return undefined;
    return asNumber(value, path);
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
    // Format-only, matching the frontend's `isValidAddress`
    // (viem `isAddress(addr, { strict: false })`).
    if (!isAddress(address, { strict: false })) {
        throw new Error(`${path} must be a 20-byte hex address.`);
    }
    return address as `0x${string}`;
}

export function asOptionalAddress(value: unknown, path: string): `0x${string}` | undefined {
    if (value === undefined) return undefined;
    return asAddress(value, path);
}
