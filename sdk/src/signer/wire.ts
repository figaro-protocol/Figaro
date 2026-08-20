/**
 * @figaro-protocol/sdk/signer — the socket wire protocol.
 *
 * JSON lines over a local UNIX socket: one request object per line, one
 * response per line, correlated by `id`. Quantities travel as strings
 * (decimal or 0x-hex) — the socket carries no BigInt and the parser strips
 * prototype-pollution keys before any shape check.
 */

import { strippingReviver } from "../safeJson.js";

export type SignerOp = "health" | "signTypedData" | "signTransaction" | "signMessage";

export interface WireRequest {
    id: number;
    op: SignerOp;
    params?: Record<string, unknown>;
}

export type WireResponse =
    | { id: number; ok: true; result: Record<string, unknown> }
    | { id: number; ok: false; error: string };

/** Parse one request line. Returns null (never throws) on garbage — the
 *  daemon answers a parse failure with a correlated error when it can, and
 *  drops the line when it cannot. */
export function parseRequest(line: string): WireRequest | null {
    let raw: unknown;
    try {
        raw = JSON.parse(line, strippingReviver);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "number" || !Number.isInteger(r.id)) return null;
    if (r.op !== "health" && r.op !== "signTypedData" && r.op !== "signTransaction" && r.op !== "signMessage") {
        return null;
    }
    if (r.params !== undefined && (typeof r.params !== "object" || r.params === null || Array.isArray(r.params))) {
        return null;
    }
    return { id: r.id, op: r.op, params: r.params as Record<string, unknown> | undefined };
}

/** Serialize with BigInt → decimal string, for both directions of the wire. */
export function wireStringify(value: unknown): string {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
