/**
 * The seller's binding form writes each assembly's path declaration as it
 * read it: `["batch"]` stays `["batch"]`, an absent declaration stays absent,
 * and a toggle changes the one path toggled. The builder and the toggle are
 * the form's own (`components/members/OnboardingAssembliesForm.tsx`).
 */
import { describe, expect, it } from "vitest";
import { buildBindings, toggledPath } from "@/components/members/OnboardingAssembliesForm";

const WALLET = "0x00000000000000000000000000000000000000a1" as const;
const A = `0x${"aa".repeat(32)}`;
const B = `0x${"bb".repeat(32)}`;
const C = `0x${"cc".repeat(32)}`;

describe("the binding form writes a path declaration back unchanged", () => {
    it("a declaration read as [batch], [direct, batch] or none is written as read", () => {
        const declared = new Map<string, ("direct" | "batch")[]>([[A, ["batch"]], [B, ["direct", "batch"]]]);
        const bindings = buildBindings(WALLET, new Set([A, B, C]), new Map(), declared);
        const byHash = Object.fromEntries(bindings.map((b) => [b.processDesignHash, b.paths]));
        expect(byHash[A]).toEqual(["batch"]);
        expect(byHash[B]).toEqual(["direct", "batch"]);
        expect(byHash[C]).toBeUndefined();
        expect(bindings.find((b) => b.processDesignHash === C)).not.toHaveProperty("paths");
    });

    it("a toggle adds or takes out the one path, in the order direct, batch", () => {
        expect(toggledPath(undefined, "batch")).toEqual(["direct", "batch"]);
        expect(toggledPath(["batch"], "direct")).toEqual(["direct", "batch"]);
        expect(toggledPath(["direct", "batch"], "direct")).toEqual(["batch"]);
        expect(toggledPath(["batch"], "batch")).toEqual([]);
    });

    it("an emptied declaration is written as none, the direct path alone", () => {
        const bindings = buildBindings(WALLET, new Set([A]), new Map(), new Map([[A, []]]));
        expect(bindings[0]).not.toHaveProperty("paths");
    });
});
