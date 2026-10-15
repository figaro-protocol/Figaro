import { describe, expect, it } from "vitest";
import { serializeAssemblyTemplate } from "@figaro-protocol/sdk";
import { deriveAssemblySlug, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

// Construct templates directly (no spec cache needed) to test the
// serialize → compositionHash → slug pipeline in isolation. The clause keys
// are opaque 32-byte hashes: the pipeline reads none of the specs behind them.
const CLAUSE = `0x${"c1".repeat(32)}` as const;
const LOOKALIKE = `0x${"c2".repeat(32)}` as const;
const composition = (x: number, clauseKey: `0x${string}` = CLAUSE): AssemblyTemplate => ({
    agreements: [{ id: "order-0", clauses: { [clauseKey]: { x } } }],
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
        const ordered: AssemblyTemplate = { agreements: [{ id: "order-0", clauses: { [CLAUSE]: { x: 1 } } }] };
        const reordered = { agreements: [{ clauses: { [CLAUSE]: { x: 1 } }, id: "order-0" }] } as AssemblyTemplate;
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

    // A clause is its spec: another version of a clause — or a lookalike that
    // shares its name — is another key, so composing it IS composing a
    // different clause: distinct compositionHash, distinct slug.
    it("composing another spec's key → distinct composition identity", () => {
        expect(slugOf(composition(1, LOOKALIKE))).not.toBe(slugOf(composition(1)));
    });
});
