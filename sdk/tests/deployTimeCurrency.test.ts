/**
 * fillDeployTimeCurrency — the deployment's token filled into the denomination
 * pin a written reference assembly leaves unfilled, against the REAL specs
 * (`clauses/`), agreements and assemblies (`agreements/`, `assemblies/`).
 *
 * The written file names no token: a live ERC-20 address exists only on a
 * deployed chain, so `figaro-utility-token` is composed as `{}` and the seeding
 * fills it before anchoring. The format reads the unfilled pin as what it is,
 * a required field missing, never as a pin to some token; the fill is read by
 * the spec's shape (assembly scope, the denomination article, a designer-filled
 * `address-hex` field), never by a clause or field name.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    assembleAuthored,
    assemblyHashOf,
    composeAuthoredAgreements,
    fillDeployTimeCurrency,
    specIsAssemblyScoped,
    type BuiltAssembly,
    type RegisteredAgreement,
} from "../src/index.js";
import { validateContent } from "../src/clauses/index.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";

const ROOT = path.join(__dirname, "../..");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8")) as object;
const names = (dir: string) => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".json")).sort();

const SPECS = specSourceFromFixtures(names("clauses").map((f) => f.replace(/\.json$/, "")));
const AGREEMENTS: Record<string, RegisteredAgreement> = Object.fromEntries(
    Object.entries(composeAuthoredAgreements(
        Object.fromEntries(names("agreements").map((f) => [f.replace(/\.json$/, ""), readJson(path.join(ROOT, "agreements", f))])),
        SPECS,
    )).map(([name, { document }]) => [name, document]),
);
const built = (file: string): BuiltAssembly => assembleAuthored(readJson(path.join(ROOT, "assemblies", file)), AGREEMENTS, SPECS);

const TOKEN = "0x6Bb43E3C52dd24CEeD652B9069A97cc9E21c99EB" as const;
const OTHER = "0x0000000000000000000000000000000000000002" as const;

/** The assembly-scoped denomination clauses an assembly composes, with the
 *  designer-filled address fields each declares — read from the specs. */
function denominationPins(assembly: BuiltAssembly["assembly"]): { clauseKey: string; fields: string[] }[] {
    return Object.keys(assembly.assemblyClauses ?? {}).flatMap((clauseKey) => {
        const spec = SPECS.get(clauseKey as `0x${string}`);
        if (!spec || !specIsAssemblyScoped(spec) || spec.hints?.article !== "denomination") return [];
        const fills = spec.hints?.designFills ?? [];
        return [{ clauseKey, fields: spec.fields.filter((f) => f.type === "string" && f.format === "address-hex" && fills.includes(f.name)).map((f) => f.name) }];
    });
}

describe("the written reference leaves its denomination pin unfilled", () => {
    const written = readJson(path.join(ROOT, "assemblies", "equipment-hire.json")) as { assemblyClauses: Record<string, Record<string, unknown>> };

    it("composes figaro-utility-token with no value — no sentinel address of any kind", () => {
        expect(written.assemblyClauses["figaro-utility-token"]).toEqual({});
    });

    it("the format reads the unfilled pin as a required field missing, not as a pin", () => {
        const spec = SPECS.get(keyOf("figaro-utility-token"))!;
        const unfilled = validateContent({}, spec);
        expect(unfilled.ok).toBe(false);
        if (!unfilled.ok) expect(unfilled.errors.map((e) => e.message).join(" ")).toMatch(/required/);
        expect(validateContent({ currency: TOKEN }, spec).ok).toBe(true);
    });
});

describe("fillDeployTimeCurrency — the deployment's token, read by the spec's shape", () => {
    it("fills exactly the denomination pin's designer-filled address field, and nothing else", () => {
        const { assembly } = built("equipment-hire.json");
        const pins = denominationPins(assembly);
        expect(pins).toHaveLength(1);
        expect(pins[0].fields).toEqual(["currency"]);
        const filled = fillDeployTimeCurrency(assembly, TOKEN, SPECS);
        expect(filled.assemblyClauses?.[pins[0].clauseKey]).toEqual({ currency: TOKEN });
        // Everything but the pin is byte-identical: the agreements, the prose, the other terms.
        const { assemblyClauses: a, ...restBefore } = assembly;
        const { assemblyClauses: b, ...restAfter } = filled;
        expect(restAfter).toEqual(restBefore);
        expect(Object.keys(b ?? {})).toEqual(Object.keys(a ?? {}));
        // Validated as the sign gate validates it: the filled pin is well-formed.
        expect(validateContent(filled.assemblyClauses![pins[0].clauseKey], SPECS.get(keyOf("figaro-utility-token"))!).ok).toBe(true);
    });

    it("the anchored identity is the FILLED assembly's: the written file's hash never matches it, and the token picks the hash", () => {
        const { assembly } = built("equipment-hire.json");
        const withToken = assemblyHashOf(fillDeployTimeCurrency(assembly, TOKEN, SPECS));
        const withOther = assemblyHashOf(fillDeployTimeCurrency(assembly, OTHER, SPECS));
        expect(withToken).not.toBe(assemblyHashOf(assembly));
        expect(withToken).not.toBe(withOther);
    });

    it("never overwrites a pin the designer filled", () => {
        const { assembly } = built("equipment-hire.json");
        const once = fillDeployTimeCurrency(assembly, TOKEN, SPECS);
        const twice = fillDeployTimeCurrency(once, OTHER, SPECS);
        expect(twice).toBe(once);
        expect(assemblyHashOf(twice)).toBe(assemblyHashOf(once));
    });

    it("an assembly with no denomination pin is returned as it was", () => {
        for (const file of names("assemblies").filter((f) => f !== "equipment-hire.json")) {
            const { assembly } = built(file);
            expect(denominationPins(assembly).every((p) => p.fields.length === 0 || Object.keys(assembly.assemblyClauses?.[p.clauseKey] ?? {}).length > 0)).toBe(true);
            expect(fillDeployTimeCurrency(assembly, TOKEN, SPECS)).toBe(assembly);
        }
    });

    it("refuses a token that is not an address, the zero address included", () => {
        const { assembly } = built("equipment-hire.json");
        expect(() => fillDeployTimeCurrency(assembly, `0x${"0".repeat(40)}`, SPECS)).toThrow(/not an address/);
        expect(() => fillDeployTimeCurrency(assembly, "0x1234" as `0x${string}`, SPECS)).toThrow(/not an address/);
    });

    it("reads the pin by shape: a clause of another article with an address field is left alone", () => {
        // figaro-commerce declares an address-hex `currency` too, but it is
        // agreement-scoped and of the mandatory article: composed at assembly
        // scope by mistake, it is still no denomination pin.
        const { assembly } = built("equipment-hire.json");
        const commerceKey = Object.keys(AGREEMENTS["counter-sale"].clauses).find((k) => SPECS.get(k as `0x${string}`)?.hints?.article === "mandatory" && SPECS.get(k as `0x${string}`)?.fields.some((f) => f.name === "currency"))!;
        const odd = { ...assembly, assemblyClauses: { ...(assembly.assemblyClauses ?? {}), [commerceKey]: {} } };
        const filled = fillDeployTimeCurrency(odd, TOKEN, SPECS);
        expect(filled.assemblyClauses?.[commerceKey]).toEqual({});
    });
});
