/**
 * The process model names the root the chain names: the order whose
 * `cumulativeValue` equals its `payment`. The sub-order's agreement may carry
 * no topology leaf, may not have loaded, or may carry `[]`; in none of these
 * is the sub-order named the root, and it shows no edge. Edges that are
 * unknown stay unknown (`follows: null`), apart from an empty leaf (`[]`).
 *
 * The orders are the UI projection of the `OrderCommitted` fold, which reads
 * both paths' events alike (`orderFromSdk`); this test proves the reader over
 * that projection, on either path.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import {
    BUYER, ROOT_HASH, ROOT_MODALITY, SUB_HASH, SUB_ORDER_CASES,
    agreementsFor, loadModalitySpec, rootOrder, subOrder, summary,
} from "./twoOrderProcess";

beforeAll(loadModalitySpec);

describe("the process model's root is the chain's root", () => {
    for (const sub of SUB_ORDER_CASES) {
        it(`sub-order agreement ${sub}: the root is the order whose cumulative value is its payment`, () => {
            const model = deriveProcessModelFromRuntime(summary, [subOrder, rootOrder], agreementsFor(sub), BUYER);
            expect(model.rootOrderId).toBe(ROOT_HASH);
            expect(model.rootModality).toBe(ROOT_MODALITY);
            const subNode = model.orders.find((o) => o.orderId === SUB_HASH);
            expect(subNode?.follows).toEqual(sub === "empty-leaf" ? [] : null);
        });
    }

    it("a process whose root order is not in the read names no root", () => {
        const model = deriveProcessModelFromRuntime(summary, [subOrder], agreementsFor("empty-leaf"), BUYER);
        expect(model.rootOrderId).toBeNull();
        expect(model.rootModality).toBeNull();
    });
});
