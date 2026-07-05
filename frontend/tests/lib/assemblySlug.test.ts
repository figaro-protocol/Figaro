import { describe, expect, it } from "vitest";
import { serializeAssemblyTemplate } from "@/lib/designer/buildAssemblyTemplate";
import { deriveAssemblySlug, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

// Construct templates directly (no spec cache needed) to test the
// serialize → compositionHash → slug pipeline in isolation.
const composition = (x: number): AssemblyTemplate => ({
    agreements: [{ id: "order-0", clauses: { "figaro-commerce": { x } } }],
});

const slugOf = (t: AssemblyTemplate) => deriveAssemblySlug(serializeAssemblyTemplate(t).compositionHash);

describe("content-derived assembly slug", () => {
    it("identical compositions → identical slug (the dedup property)", () => {
        expect(slugOf(composition(1))).toBe(slugOf(composition(1)));
    });

    it("distinct compositions → distinct slugs (no conflation)", () => {
        expect(slugOf(composition(1))).not.toBe(slugOf(composition(2)));
    });

    it("slug is stable under object-key reordering (canonicalization)", () => {
        const ordered: AssemblyTemplate = { agreements: [{ id: "order-0", clauses: { "figaro-commerce": { x: 1 } } }] };
        const reordered = { agreements: [{ clauses: { "figaro-commerce": { x: 1 } }, id: "order-0" }] } as AssemblyTemplate;
        expect(serializeAssemblyTemplate(ordered).compositionHash).toBe(serializeAssemblyTemplate(reordered).compositionHash);
    });

    it("format: asm- prefix + 16 hex", () => {
        expect(deriveAssemblySlug(`0x${"a".repeat(64)}` as `0x${string}`)).toMatch(/^asm-[0-9a-f]{16}$/);
    });

    // R2: editorial name/summary/description are pinned in the document but MUST
    // NOT enter the content hash — renaming an assembly never forks its slug.
    it("editorial fields (name/summary/description) do not change the slug", () => {
        const plain = composition(1);
        const titled: AssemblyTemplate = { ...plain, name: "Direct Sale", summary: "One-node on-site sale", description: "A buyer and a café, face to face." };
        expect(slugOf(titled)).toBe(slugOf(plain));
    });

    it("but the pinned document DOES carry the editorial prose", () => {
        const titled: AssemblyTemplate = { ...composition(1), name: "Direct Sale" };
        expect(JSON.parse(serializeAssemblyTemplate(titled).json).name).toBe("Direct Sale");
    });

    // The version-as-evolution axis, propagated through assembly identity:
    // a clause's identity is (name, version), and composing v2 IS composing a
    // different clause — distinct compositionHash, distinct slug. (The clause
    // side of the axis is covered in Foundry:
    // ClauseRegistryTest.test_sameNameDifferentVersionIsDistinct.)
    it("composing a clause's v2 → distinct composition identity", () => {
        const onV2: AssemblyTemplate = {
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": { x: 1 } }, clauseVersions: { "figaro-commerce": 2 } }],
        };
        expect(slugOf(onV2)).not.toBe(slugOf(composition(1)));
    });

    // Normalization invariant: v1 pins are never serialized, so a v1-only
    // template hashes identically to the pre-version-field form — no reseed,
    // no slug churn. (The builder enforces the omission; this pins the hash.)
    it("an explicit v1 map would fork the hash — which is why the builder omits it", () => {
        const explicitV1 = {
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": { x: 1 } }, clauseVersions: { "figaro-commerce": 1 } }],
        } as AssemblyTemplate;
        expect(slugOf(explicitV1)).not.toBe(slugOf(composition(1)));
    });
});
