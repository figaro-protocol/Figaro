import { describe, expect, it } from "vitest";
import { computeChainPositions, type CommittedLogWithPosition } from "../scripts/rpgf-sequencer/chainPosition.js";

describe("computeChainPositions", () => {
    it("assigns 1 to the only order in a process", () => {
        const logs: CommittedLogWithPosition[] = [
            { order_hash: "0x01", process_id: "0xa", block_number: 100, log_index: 0 },
        ];
        const positions = computeChainPositions(logs);
        expect(positions.get("0x01")).toBe(1);
    });

    it("orders within a process by (blockNumber, logIndex)", () => {
        const logs: CommittedLogWithPosition[] = [
            { order_hash: "0x03", process_id: "0xa", block_number: 102, log_index: 0 },
            { order_hash: "0x01", process_id: "0xa", block_number: 100, log_index: 0 },
            { order_hash: "0x02", process_id: "0xa", block_number: 100, log_index: 5 },
        ];
        const positions = computeChainPositions(logs);
        expect(positions.get("0x01")).toBe(1);
        expect(positions.get("0x02")).toBe(2);
        expect(positions.get("0x03")).toBe(3);
    });

    it("scopes positions per process — different processes both start at 1", () => {
        const logs: CommittedLogWithPosition[] = [
            { order_hash: "0xa1", process_id: "0xa", block_number: 100, log_index: 0 },
            { order_hash: "0xb1", process_id: "0xb", block_number: 100, log_index: 1 },
            { order_hash: "0xa2", process_id: "0xa", block_number: 101, log_index: 0 },
        ];
        const positions = computeChainPositions(logs);
        expect(positions.get("0xa1")).toBe(1);
        expect(positions.get("0xa2")).toBe(2);
        expect(positions.get("0xb1")).toBe(1);
    });

    it("is deterministic — input order does not affect output", () => {
        const a: CommittedLogWithPosition[] = [
            { order_hash: "0x01", process_id: "0xa", block_number: 100, log_index: 0 },
            { order_hash: "0x02", process_id: "0xa", block_number: 101, log_index: 0 },
            { order_hash: "0x03", process_id: "0xa", block_number: 102, log_index: 0 },
        ];
        const b = [...a].reverse();
        const posA = computeChainPositions(a);
        const posB = computeChainPositions(b);
        expect(posA.get("0x01")).toBe(posB.get("0x01"));
        expect(posA.get("0x02")).toBe(posB.get("0x02"));
        expect(posA.get("0x03")).toBe(posB.get("0x03"));
    });

    it("handles empty input", () => {
        const positions = computeChainPositions([]);
        expect(positions.size).toBe(0);
    });
});
