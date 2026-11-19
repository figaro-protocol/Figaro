#!/usr/bin/env node
// The arithmetic of scripts/propose-gas-constants.mjs, on receipts written here.
//
//   node --test scripts/test-propose-gas-constants.mjs
//
// Cases: the line through N=1 and N=2 gives the per-order cost and the fixed
// overhead, each rounded up to 1,000; the dearest receipt of each N is the one
// read; a sub-order commit gives the commit constant and a root commit only the
// premium; missing receipts are named, never guessed; the tree's current
// values are read from sdk/src/gasCeilings.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { currentConstants, propose } from "./propose-gas-constants.mjs";

test("the resolve line gives the per-order cost and the overhead", () => {
    const { proposed, missing } = propose({
        resolves: [{ orderCount: 1n, gasUsed: 102_400n }, { orderCount: 2n, gasUsed: 131_900n }],
        commits: [],
    });
    // slope 29,500 → 30,000; intercept 102,400 − 29,500 = 72,900 → 73,000
    assert.equal(proposed.RESOLVE_GAS_PER_ORDER, 30_000n);
    assert.equal(proposed.RESOLVE_FIXED_OVERHEAD, 73_000n);
    assert.equal(missing.length, 1); // no commit receipts
});

test("the dearest receipt of each N is read", () => {
    const { proposed } = propose({
        resolves: [
            { orderCount: 1n, gasUsed: 90_000n }, { orderCount: 1n, gasUsed: 100_000n },
            { orderCount: 2n, gasUsed: 125_000n }, { orderCount: 2n, gasUsed: 130_000n },
            { orderCount: 3n, gasUsed: 1n },
        ],
        commits: [],
    });
    assert.equal(proposed.RESOLVE_GAS_PER_ORDER, 30_000n);
    assert.equal(proposed.RESOLVE_FIXED_OVERHEAD, 70_000n);
});

test("a sub-order commit gives the constant; a root commit gives only the premium", () => {
    const { proposed, evidence } = propose({
        resolves: [],
        commits: [{ root: true, gasUsed: 520_000n }, { root: false, gasUsed: 382_100n }, { root: false, gasUsed: 370_000n }],
    });
    assert.equal(proposed.COMMIT_GAS_PER_ORDER, 383_000n);
    assert.equal(evidence.rootPremium, 520_000n - 382_100n);
});

test("missing receipts are named and nothing is guessed", () => {
    const { proposed, missing } = propose({ resolves: [{ orderCount: 1n, gasUsed: 100_000n }], commits: [{ root: true, gasUsed: 500_000n }] });
    assert.deepEqual(proposed, {});
    assert.equal(missing.length, 2);
    assert.match(missing[0], /N=2 \(0 found\)/);
    assert.match(missing[1], /no sub-order commit/);
});

test("a two-order resolve no dearer than a one-order resolve gives no slope", () => {
    const { proposed, missing } = propose({ resolves: [{ orderCount: 1n, gasUsed: 100_000n }, { orderCount: 2n, gasUsed: 99_000n }], commits: [] });
    assert.equal(proposed.RESOLVE_GAS_PER_ORDER, undefined);
    assert.match(missing[0], /no slope/);
});

test("the tree's values are read from sdk/src/gasCeilings.ts", () => {
    const now = currentConstants();
    for (const [name, v] of Object.entries(now)) assert.equal(typeof v, "bigint", name);
});
