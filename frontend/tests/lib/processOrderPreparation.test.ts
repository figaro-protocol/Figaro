import { describe, expect, it } from "vitest";

import {
    buildExpectedCumulativeValue,
    getLinearPredecessorOrderHash,
    resolveSubOrderParentHashes,
} from "@/lib/core/processOrderPreparation";

describe("processOrderPreparation", () => {
    it("builds the next cumulative value from current cumulative and payment", () => {
        expect(buildExpectedCumulativeValue(10n, 4n)).toBe(14n);
    });

    it("prefers explicit parent hashes and otherwise falls back to defaults", () => {
        expect(resolveSubOrderParentHashes({
            parentOrderIds: "0xaaa, 0xbbb",
            defaultParentOrderIds: ["0xccc"],
            parentOrderId: "0xddd",
        })).toEqual(["0xaaa", "0xbbb"]);

        expect(resolveSubOrderParentHashes({
            parentOrderIds: "",
            defaultParentOrderIds: ["0xccc"],
            parentOrderId: "0xddd",
        })).toEqual(["0xccc"]);

        expect(resolveSubOrderParentHashes({
            parentOrderIds: "",
            parentOrderId: "0xddd",
        })).toEqual(["0xddd"]);
    });

    it("selects the linear predecessor by cumulative value then order hash", () => {
        expect(getLinearPredecessorOrderHash([
            { orderHash: ("0x" + "11".repeat(32)) as `0x${string}`, cumulativeValue: 5n },
            { orderHash: ("0x" + "33".repeat(32)) as `0x${string}`, cumulativeValue: 9n },
            { orderHash: ("0x" + "22".repeat(32)) as `0x${string}`, cumulativeValue: 9n },
        ])).toBe(("0x" + "33".repeat(32)) as `0x${string}`);
    });
});
