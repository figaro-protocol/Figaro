import { describe, it, expect } from "vitest";
import {
    filterByClause,
    filterByProcess,
    filterByOrder,
    filterByStage,
} from "../src/extensions/attestation.js";
import type { Hex, Address, AttestationEvent } from "../src/types.js";
import { keccak256, stringToHex, encodeAbiParameters } from "viem";

// ── Helpers ─────────────────────────────────────────────────────────────────

const addr = (n: number): Address =>
    `0x${n.toString(16).padStart(40, "0")}` as Address;
const hex32 = (n: number): Hex =>
    `0x${n.toString(16).padStart(64, "0")}` as Hex;

// Two arbitrary clause IDs — the filters are clause-agnostic.
const CLAUSE_A_ID = keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], ["clause-a", 1n]));
const CLAUSE_B_ID = keccak256(stringToHex("clause-b"));

function makeAttestation(overrides: Partial<AttestationEvent> = {}): AttestationEvent {
    return {
        orderHash: hex32(1),
        processId: hex32(100),
        attester: addr(1),
        clauseId: CLAUSE_A_ID,
        stage: 0,
        contentRef: hex32(0),
        blockNumber: 10,
        ...overrides,
    };
}

// ── Attestation event filtering ─────────────────────────────────────────────

describe("event filtering", () => {
    const events: AttestationEvent[] = [
        makeAttestation({ processId: hex32(100), clauseId: CLAUSE_A_ID, stage: 0 }),
        makeAttestation({ processId: hex32(100), clauseId: CLAUSE_B_ID, stage: 1 }),
        makeAttestation({ processId: hex32(200), clauseId: CLAUSE_A_ID, stage: 1 }),
        makeAttestation({ processId: hex32(100), clauseId: CLAUSE_A_ID, stage: 1, orderHash: hex32(5) }),
    ];

    it("filterByClause", () => {
        expect(filterByClause(events, CLAUSE_A_ID)).toHaveLength(3);
    });

    it("filterByProcess", () => {
        expect(filterByProcess(events, hex32(100))).toHaveLength(3);
        expect(filterByProcess(events, hex32(200))).toHaveLength(1);
    });

    it("filterByOrder", () => {
        expect(filterByOrder(events, hex32(5))).toHaveLength(1);
    });

    it("filterByStage", () => {
        expect(filterByStage(events, 0)).toHaveLength(1);
        expect(filterByStage(events, 1)).toHaveLength(3);
    });
});
