import { describe, expect, it } from "vitest";
import type { SpecParseError } from "@figaro/core/clauses";
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

    it("rejects an invalid tier", () => {
        const { block } = parse({ tier: "made-up", article: "logistics", mechanismKinds: [], moduleIds: [] });
        expect(block).toBeNull();
    });

    it("rejects a block missing article (article is required — the sole classification)", () => {
        const { block, errors } = parse({ tier: "cross-checked", mechanismKinds: [], moduleIds: [] });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.article")).toBe(true);
    });

    it("parses a full valid binding (tier + article + wiring)", () => {
        const { block } = parse({
            tier: "cross-checked",
            article: "coordination",
            mechanismKinds: ["proximity"],
            moduleIds: ["proximity-policy"],
        });
        expect(block).not.toBeNull();
        expect(block?.tier).toBe("cross-checked");
        expect(block?.article).toBe("coordination");
        expect(block?.mechanismKinds).toEqual(["proximity"]);
        expect(block?.moduleIds).toEqual(["proximity-policy"]);
    });

    // The drawer's cross-clause nesting (e.g. a proximity policy under the hand-off
    // clause's `handoff` field) is read from block.nestsUnder — it MUST round-trip.
    it("preserves nestsUnder", () => {
        const { block } = parse({ tier: "cross-checked", article: "coordination", mechanismKinds: [], moduleIds: [], nestsUnder: "handoff" });
        expect(block?.nestsUnder).toBe("handoff");
    });

    it("rejects an empty-string nestsUnder", () => {
        const { block } = parse({ tier: "cross-checked", article: "coordination", mechanismKinds: [], moduleIds: [], nestsUnder: "" });
        expect(block).toBeNull();
    });

    // mechanismKinds / moduleIds are OPTIONAL composition wiring — a pure attestation
    // lifecycle (or any minimal stranger's clause) omits them. Absent ⇒ [].
    it("treats mechanismKinds/moduleIds as optional (absent ⇒ [])", () => {
        const { block } = parse({ tier: "runtime", article: "attestations", attestation: "seller" });
        expect(block?.mechanismKinds).toEqual([]);
        expect(block?.moduleIds).toEqual([]);
    });

    it("rejects a malformed (non-array) mechanismKinds", () => {
        const { block } = parse({ tier: "runtime", article: "attestations", mechanismKinds: "nope" });
        expect(block).toBeNull();
    });

    // Structural clauses (commerce, topology) are composed on every order, never a
    // designer choice. Generic surfaces read this flag to exclude them.
    it("preserves structural", () => {
        const { block } = parse({ tier: "cross-checked", article: "commerce", mechanismKinds: [], moduleIds: [], structural: true });
        expect(block?.structural).toBe(true);
    });

    it("rejects a non-boolean structural", () => {
        const { block } = parse({ tier: "cross-checked", article: "commerce", mechanismKinds: [], moduleIds: [], structural: "yes" });
        expect(block).toBeNull();
    });

    // Default-on clauses are pre-composed on every fresh designer node — removable in
    // the drawer, unlike structural. Generic surfaces compose the set from this flag.
    it("preserves defaultOn", () => {
        const { block } = parse({ tier: "cross-checked", article: "logistics", mechanismKinds: [], moduleIds: [], defaultOn: true });
        expect(block?.defaultOn).toBe(true);
    });

    it("rejects a non-boolean defaultOn", () => {
        const { block } = parse({ tier: "cross-checked", article: "logistics", mechanismKinds: [], moduleIds: [], defaultOn: "yes" });
        expect(block).toBeNull();
    });

    // The generic runtime engine reads attestation to surface a clause's attestation
    // to the right party/parties (seller, or bilateral) — no clause names.
    it("preserves attestation", () => {
        const { block } = parse({ tier: "runtime", article: "attestations", mechanismKinds: [], moduleIds: [], attestation: "bilateral" });
        expect(block?.attestation).toBe("bilateral");
    });

    it("rejects an invalid attestation", () => {
        const { block } = parse({ tier: "runtime", article: "attestations", mechanismKinds: [], moduleIds: [], attestation: "buyer" });
        expect(block).toBeNull();
    });

    // The generic engine reads handoffStages to pair a proximity cross-witness at the
    // physical hand-off stages of a lifecycle clause — round-trip it.
    it("preserves handoffStages", () => {
        const { block } = parse({ tier: "runtime", article: "attestations", mechanismKinds: [], moduleIds: [], handoffStages: ["handed-off"] });
        expect(block?.handoffStages).toEqual(["handed-off"]);
    });
});
