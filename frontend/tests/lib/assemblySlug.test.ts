import { describe, expect, it } from "vitest";
import { agreementHashOf, serializeProcessDesign } from "@figaro-protocol/sdk";
import { deriveProcessDesignSlug, type ProcessDesign } from "@/lib/shared/assembly";

// Construct assemblies directly (no spec cache needed) to test the
// serialize → processDesignHash → slug pipeline in isolation. The clause keys
// are opaque 32-byte hashes: the pipeline reads none of the specs behind them.
// Each agreement binds the agreement those clauses key to.
const CLAUSE = `0x${"c1".repeat(32)}` as const;
const LOOKALIKE = `0x${"c2".repeat(32)}` as const;
const composition = (x: number, clauseKey: `0x${string}` = CLAUSE): ProcessDesign => ({
    agreements: [{ id: "agreement-0", agreementHash: agreementHashOf({ clauses: { [clauseKey]: { x } } }), clauses: {} }],
});

const slugOf = (t: ProcessDesign) => deriveProcessDesignSlug(serializeProcessDesign(t).processDesignHash);

describe("content-derived assembly slug", () => {
    it("identical compositions → identical slug (the dedup property)", () => {
        // Two compositions built apart, their keys in another order, name one
        // slug: the one fixed below for this content.
        const apart = { agreements: [{ clauses: {}, agreementHash: agreementHashOf({ clauses: { [CLAUSE]: { x: 1 } } }), id: "agreement-0" }] } as ProcessDesign;
        expect(slugOf(composition(1))).toBe("asm-14d38787c5ddbff0");
        expect(slugOf(apart)).toBe("asm-14d38787c5ddbff0");
    });

    it("distinct compositions → distinct slugs (no conflation)", () => {
        expect(slugOf(composition(1))).not.toBe(slugOf(composition(2)));
    });

    it("slug is stable under object-key reordering (canonicalization)", () => {
        const agreementHash = composition(1).agreements[0].agreementHash;
        const ordered: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash, clauses: { [CLAUSE]: { a: 1, b: 2 } } }] };
        const reordered = { agreements: [{ clauses: { [CLAUSE]: { b: 2, a: 1 } }, agreementHash, id: "agreement-0" }] } as ProcessDesign;
        expect(serializeProcessDesign(ordered).processDesignHash).toBe(serializeProcessDesign(reordered).processDesignHash);
    });

    it("format: asm- prefix + 16 hex", () => {
        expect(deriveProcessDesignSlug(`0x${"a".repeat(64)}` as `0x${string}`)).toMatch(/^asm-[0-9a-f]{16}$/);
    });

    // R2: editorial name/summary/description are pinned in the document but MUST
    // NOT enter the content hash — renaming an assembly never forks its slug.
    it("editorial fields (name/summary/description) do not change the slug", () => {
        const plain = composition(1);
        const titled: ProcessDesign = { ...plain, name: "Direct Sale", summary: "One-node on-site sale", description: "A buyer and a café, face to face." };
        expect(slugOf(titled)).toBe(slugOf(plain));
    });

    it("but the pinned document DOES carry the editorial prose", () => {
        const titled: ProcessDesign = { ...composition(1), name: "Direct Sale" };
        expect(JSON.parse(serializeProcessDesign(titled).json).name).toBe("Direct Sale");
    });

    // A clause is its spec: another version of a clause — or a lookalike that
    // shares its name — is another key, so composing it IS composing a
    // different clause: distinct processDesignHash, distinct slug.
    it("composing another spec's key → distinct composition identity", () => {
        expect(slugOf(composition(1, LOOKALIKE))).not.toBe(slugOf(composition(1)));
    });
});
