/**
 * useOffsetRetirement — pure-helper tests.
 *
 * The hook itself is wagmi-heavy (useReadContract, useWriteContract, useWaitForTransactionReceipt
 * × 3) and is best verified end-to-end against the MockOffsetAggregator on
 * devnet (see tests/e2e/offset-flow.devnet.spec.ts). This file covers the
 * pure helper that drives the grams→tonnes conversion since the
 * "always round up so we don't under-offset" rule is load-bearing for
 * audit-bundle correctness.
 */

import { describe, expect, it } from "vitest";
import { gramsToTonsCeil1e18 } from "@/lib/composition/useOffsetRetirement";

const ONE_TONNE_IN_1E18 = 10n ** 18n;

describe("gramsToTonsCeil1e18", () => {
    it("returns 0 for 0 grams", () => {
        expect(gramsToTonsCeil1e18(0n)).toBe(0n);
    });

    it("returns 1 tonne (1e18) for exactly 1 tonne in grams (1_000_000)", () => {
        expect(gramsToTonsCeil1e18(1_000_000n)).toBe(ONE_TONNE_IN_1E18);
    });

    it("rounds up to 1 tonne for a single gram (no under-offsetting)", () => {
        expect(gramsToTonsCeil1e18(1n)).toBe(ONE_TONNE_IN_1E18);
    });

    it("rounds up to 1 tonne for 999_999 grams", () => {
        expect(gramsToTonsCeil1e18(999_999n)).toBe(ONE_TONNE_IN_1E18);
    });

    it("returns 2 tonnes for 1_000_001 grams (one above the boundary)", () => {
        expect(gramsToTonsCeil1e18(1_000_001n)).toBe(2n * ONE_TONNE_IN_1E18);
    });

    it("returns N tonnes exactly for N * 1_000_000 grams", () => {
        for (const n of [1n, 2n, 5n, 10n, 100n, 1_000n, 1_000_000n]) {
            expect(gramsToTonsCeil1e18(n * 1_000_000n)).toBe(n * ONE_TONNE_IN_1E18);
        }
    });

    it("rounds up the partial tonne component", () => {
        // 3 full tonnes (3_000_000 g) plus 1 g → 4 tonnes.
        expect(gramsToTonsCeil1e18(3_000_001n)).toBe(4n * ONE_TONNE_IN_1E18);
    });

    it("handles very large gram counts without precision loss", () => {
        const grams = 12_345_678_901_234_567n; // ~12.3 billion tonnes
        const expectedTonnes = 12_345_678_902n; // ceiling of grams / 1_000_000
        expect(gramsToTonsCeil1e18(grams)).toBe(expectedTonnes * ONE_TONNE_IN_1E18);
    });
});
