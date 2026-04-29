import { describe, expect, it } from "vitest";
import { safeJsonParse, safeJsonFromResponse, strippingReviver } from "@/lib/shared/safeJson";

describe("safeJsonParse", () => {
    it("parses valid JSON into a typed value", () => {
        expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
        expect(safeJsonParse<number[]>('[1,2,3]')).toEqual([1, 2, 3]);
        expect(safeJsonParse<string>('"hello"')).toBe("hello");
    });

    it("returns null on parse failure", () => {
        expect(safeJsonParse("not json")).toBeNull();
        expect(safeJsonParse("{a:1}")).toBeNull();
        expect(safeJsonParse("")).toBeNull();
    });

    it("returns null when input is not a string", () => {
        expect(safeJsonParse(undefined)).toBeNull();
        expect(safeJsonParse(null)).toBeNull();
        expect(safeJsonParse(42)).toBeNull();
        expect(safeJsonParse({})).toBeNull();
    });

    it("strips __proto__ keys to prevent prototype pollution via Object.assign", () => {
        const malicious = '{"safe":1,"__proto__":{"polluted":"yes"}}';
        const parsed = safeJsonParse<Record<string, unknown>>(malicious);

        expect(parsed).toEqual({ safe: 1 });
        // Object.assign is the typical downstream operation that triggers the
        // prototype-setter side effect when __proto__ is an own property.
        const target = {} as Record<string, unknown>;
        Object.assign(target, parsed);
        // The fresh empty object's prototype is Object.prototype; "polluted"
        // would appear if the proto were set.
        expect((target as { polluted?: unknown }).polluted).toBeUndefined();
        expect((Object.prototype as { polluted?: unknown }).polluted).toBeUndefined();
    });

    it("strips constructor keys", () => {
        const malicious = '{"constructor":{"prototype":{"polluted":"yes"}}}';
        const parsed = safeJsonParse<Record<string, unknown>>(malicious);

        expect(parsed).toEqual({});
    });

    it("strips prototype keys", () => {
        const malicious = '{"prototype":{"polluted":"yes"}}';
        const parsed = safeJsonParse<Record<string, unknown>>(malicious);

        expect(parsed).toEqual({});
    });

    it("strips dangerous keys recursively", () => {
        const malicious = '{"a":{"b":{"__proto__":{"polluted":"yes"},"c":3}}}';
        const parsed = safeJsonParse<{ a: { b: { c: number } } }>(malicious);

        expect(parsed).toEqual({ a: { b: { c: 3 } } });
    });

    it("preserves legitimate fields adjacent to dangerous ones", () => {
        const mixed = '{"safe":1,"__proto__":{"x":1},"alsoSafe":2}';
        const parsed = safeJsonParse<Record<string, unknown>>(mixed);

        expect(parsed).toEqual({ safe: 1, alsoSafe: 2 });
    });

    it("does not strip dangerous keys when they appear as string values", () => {
        const benign = '{"description":"Use the __proto__ field with caution"}';
        const parsed = safeJsonParse<{ description: string }>(benign);

        expect(parsed).toEqual({ description: "Use the __proto__ field with caution" });
    });
});

describe("strippingReviver (used directly by callers that need throws on parse error)", () => {
    it("returns the value unchanged for safe keys", () => {
        expect(strippingReviver("safe", 1)).toBe(1);
        expect(strippingReviver("name", "alice")).toBe("alice");
        expect(strippingReviver("", { a: 1 })).toEqual({ a: 1 }); // root-key reviver call
    });

    it("returns undefined for dangerous keys (which JSON.parse drops)", () => {
        expect(strippingReviver("__proto__", { polluted: "yes" })).toBeUndefined();
        expect(strippingReviver("constructor", { x: 1 })).toBeUndefined();
        expect(strippingReviver("prototype", { y: 1 })).toBeUndefined();
    });

    it("strips dangerous keys when used as JSON.parse reviver, preserving throws on malformed JSON", () => {
        const safe = JSON.parse('{"a":1,"__proto__":{"polluted":"yes"}}', strippingReviver);
        expect(safe).toEqual({ a: 1 });

        // The throw behavior is the reason callers use the reviver directly
        // instead of safeJsonParse (which swallows errors as null).
        expect(() => JSON.parse("not json", strippingReviver)).toThrow();
    });

    it("composes with downstream revivers (e.g. bigint rehydration)", () => {
        const json = '{"amount":"0xnff","__proto__":{"polluted":"yes"}}';
        const result = JSON.parse(json, (key, value) => {
            const stripped = strippingReviver(key, value);
            if (stripped === undefined) return undefined;
            return typeof stripped === "string" && stripped.startsWith("0xn")
                ? BigInt(`0x${stripped.slice(3)}`)
                : stripped;
        });

        expect(result).toEqual({ amount: 255n });
    });
});

describe("safeJsonFromResponse", () => {
    it("returns parsed JSON for an OK response", async () => {
        const res = new Response('{"a":1}', { status: 200 });
        expect(await safeJsonFromResponse(res)).toEqual({ a: 1 });
    });

    it("returns null for a non-OK response", async () => {
        const res = new Response("forbidden", { status: 403 });
        expect(await safeJsonFromResponse(res)).toBeNull();
    });

    it("returns null when the body is not parseable JSON", async () => {
        const res = new Response("not json", { status: 200 });
        expect(await safeJsonFromResponse(res)).toBeNull();
    });

    it("strips __proto__ from network-fetched JSON", async () => {
        const res = new Response('{"safe":1,"__proto__":{"polluted":"yes"}}', { status: 200 });
        const parsed = await safeJsonFromResponse<Record<string, unknown>>(res);

        expect(parsed).toEqual({ safe: 1 });
    });

    it("propagates body-read errors as null", async () => {
        // Simulate a Response whose .text() throws.
        const res = {
            ok: true,
            text: () => Promise.reject(new Error("network failure")),
        } as unknown as Response;
        expect(await safeJsonFromResponse(res)).toBeNull();
    });
});
