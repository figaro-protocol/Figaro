import { describe, expect, it } from "vitest";
import type { SpecParseError } from "@figaro/sdk/clauses";
import { parseBlockBinding, type ClauseBlockBinding } from "@/lib/shared/clauseBlockBinding";

/**
 * Block-binding parse tests — the `block` slice of a clause spec is frontend-owned
 * presentation metadata (moved out of the SDK in the K1-SoC separation: the SDK
 * `ClauseSpec` is content-only). These exercise the same round-trip + rejection
 * cases the SDK parser once did, now against `parseBlockBinding` directly.
 *
 * `tier` and `article` are the two REQUIRED block fields (article is the clause's
 * sole classification post-K1-OW); everything else is optional. Fixtures therefore
 * carry an article whenever they expect a valid binding — and when they target a
 * specific other field's rejection, since article is checked before it.
 */

/** Parse a block object; returns the binding (or null) — errors collected internally. */
function parse(raw: unknown): { block: ClauseBlockBinding | null; errors: SpecParseError[] } {
    const errors: SpecParseError[] = [];
    const block = parseBlockBinding(raw, "$.block", errors);
    return { block, errors };
}

describe("parseBlockBinding — clause block-binding (frontend presentation slice)", () => {
    it("rejects a non-object input", () => {
        const { block, errors } = parse("nope");
        expect(block).toBeNull();
        expect(errors[0]?.path).toBe("$.block");
    });

    it("rejects a block missing article (article is required — the sole classification)", () => {
        const { block, errors } = parse({mechanismKinds: [] });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.article")).toBe(true);
    });

    it("parses a full valid binding (article only)", () => {
        const { block } = parse({ article: "coordination" });
        expect(block).not.toBeNull();
        expect(block?.article).toBe("coordination");
    });

    it("preserves catalogueSourced (the product-property marker)", () => {
        const { block } = parse({ article: "logistics", catalogueSourced: true });
        expect(block?.catalogueSourced).toBe(true);
    });

    it("omits catalogueSourced when absent (not coerced to false)", () => {
        const { block } = parse({ article: "logistics" });
        expect(block?.catalogueSourced).toBeUndefined();
    });

    it("rejects a non-boolean catalogueSourced", () => {
        const { block, errors } = parse({ article: "logistics", catalogueSourced: "yes" });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.catalogueSourced")).toBe(true);
    });

    // The drawer's cross-clause nesting (e.g. a proximity policy under the hand-off
    // clause's `handoff` field) is read from block.nestsUnder — it MUST round-trip.
    it("preserves nestsUnder", () => {
        const { block } = parse({ article: "coordination", nestsUnder: "handoff" });
        expect(block?.nestsUnder).toBe("handoff");
    });

    it("rejects an empty-string nestsUnder", () => {
        const { block } = parse({ article: "coordination", nestsUnder: "" });
        expect(block).toBeNull();
    });

});
