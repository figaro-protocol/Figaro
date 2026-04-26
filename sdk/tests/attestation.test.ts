import { describe, it, expect } from "vitest";
import {
    computeSchemaId,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    DisclosureKind,
    DISCLOSURE_KIND_LABELS,
    encodeCommitmentRef,
    encodeGramsRef,
    decodeGramsRef,
    formatGrams,
    filterLogsBySource,
    filterBySchema,
    filterByProcess,
    filterByOrder,
    filterByStage,
    buildProcessDisclosureSummary,
} from "../src/extensions/attestation.js";
import type { Hex, Address, AttestationEvent } from "../src/types.js";
import { keccak256, stringToHex } from "viem";

// ── Helpers ─────────────────────────────────────────────────────────────────

const addr = (n: number): Address =>
    `0x${n.toString(16).padStart(40, "0")}` as Address;
const hex32 = (n: number): Hex =>
    `0x${n.toString(16).padStart(64, "0")}` as Hex;

// Use the ISO-14064 sister schema as the canonical GHG schema for tests.
const GHG_SCHEMA_KEY = "figaro-ghg-iso-14064-v1";
const GHG_SCHEMA_ID = keccak256(stringToHex(GHG_SCHEMA_KEY));
const OTHER_SCHEMA_ID = keccak256(stringToHex("other-schema"));

function makeAttestation(overrides: Partial<AttestationEvent> = {}): AttestationEvent {
    return {
        orderHash: hex32(1),
        processId: hex32(100),
        attester: addr(1),
        schemaId: GHG_SCHEMA_ID,
        stage: DisclosureKind.Commitment,
        contentRef: hex32(0),
        blockNumber: 10,
        ...overrides,
    };
}

// ── computeSchemaId ─────────────────────────────────────────────────────────

describe("computeSchemaId", () => {
    it("matches keccak256(stringToHex(key))", () => {
        const id = computeSchemaId("figaro-ghg-iso-14064-v1");
        expect(id).toBe(keccak256(stringToHex("figaro-ghg-iso-14064-v1")));
    });

    it("different keys produce different IDs", () => {
        const a = computeSchemaId("key-a");
        const b = computeSchemaId("key-b");
        expect(a).not.toBe(b);
    });

    it("GHG_SCHEMA_KEY produces known hash", () => {
        expect(computeSchemaId(GHG_SCHEMA_KEY)).toBe(GHG_SCHEMA_ID);
    });
});

// ── GHG constants ───────────────────────────────────────────────────────────

describe("GHG constants", () => {
    it("GHG_DISCLOSURE_SCHEMA_KEYS contains 5 sister schemas", () => {
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toHaveLength(5);
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toContain("figaro-ghg-protocol-v1");
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toContain("figaro-ghg-iso-14064-v1");
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toContain("figaro-ghg-pas-2050-v1");
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toContain("figaro-ghg-en-16258-v1");
        expect(GHG_DISCLOSURE_SCHEMA_KEYS).toContain("figaro-ghg-custom-v1");
    });

    it("DisclosureKind has 4 values", () => {
        expect(DisclosureKind.Commitment).toBe(0);
        expect(DisclosureKind.Inventory).toBe(1);
        expect(DisclosureKind.Restatement).toBe(2);
        expect(DisclosureKind.Verification).toBe(3);
    });

    it("labels map all kinds", () => {
        expect(DISCLOSURE_KIND_LABELS[DisclosureKind.Commitment]).toBe("Commitment");
        expect(DISCLOSURE_KIND_LABELS[DisclosureKind.Verification]).toBe("Verification");
    });
});

// ── encodeCommitmentRef ─────────────────────────────────────────────────────

describe("encodeCommitmentRef", () => {
    it("returns a bytes32 hex string", () => {
        const ref = encodeCommitmentRef(hex32(42), "seller");
        expect(ref).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("different inputs produce different refs", () => {
        const a = encodeCommitmentRef(hex32(1), "seller");
        const b = encodeCommitmentRef(hex32(1), "buyer");
        expect(a).not.toBe(b);
    });
});

// ── encodeGramsRef / decodeGramsRef ─────────────────────────────────────────

describe("grams encoding", () => {
    it("round-trips a value", () => {
        const ref = encodeGramsRef(12345n);
        const decoded = decodeGramsRef(ref);
        expect(decoded).toBe(12345n);
    });

    it("decodes zero as null", () => {
        const ref = encodeGramsRef(0n);
        expect(decodeGramsRef(ref)).toBe(null);
    });

    it("encodes to 66-char hex string (0x + 64)", () => {
        const ref = encodeGramsRef(999n);
        expect(ref.length).toBe(66);
    });
});

// ── formatGrams ─────────────────────────────────────────────────────────────

describe("formatGrams", () => {
    it("formats small values in grams", () => {
        expect(formatGrams(500n)).toBe("500 g CO2e");
    });

    it("formats kg values", () => {
        expect(formatGrams(1500n)).toBe("1.50 kg CO2e");
    });

    it("formats exact kg without decimals", () => {
        expect(formatGrams(2000n)).toBe("2 kg CO2e");
    });

    it("formats tonnes", () => {
        expect(formatGrams(1_500_000n)).toBe("1.500 t CO2e");
    });
});

// ── Attestation event filtering ─────────────────────────────────────────────

describe("event filtering", () => {
    const events: AttestationEvent[] = [
        makeAttestation({ processId: hex32(100), schemaId: GHG_SCHEMA_ID, stage: 0 }),
        makeAttestation({ processId: hex32(100), schemaId: OTHER_SCHEMA_ID, stage: 1 }),
        makeAttestation({ processId: hex32(200), schemaId: GHG_SCHEMA_ID, stage: 1 }),
        makeAttestation({ processId: hex32(100), schemaId: GHG_SCHEMA_ID, stage: 1, orderHash: hex32(5) }),
    ];

    it("filterBySchema", () => {
        expect(filterBySchema(events, GHG_SCHEMA_ID)).toHaveLength(3);
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

// ── filterLogsBySource ──────────────────────────────────────────────────────

describe("filterLogsBySource", () => {
    const COORDINATOR = addr(0xAC);
    const BATCH_VERIFIER = addr(0xBA);
    const OTHER = addr(0xFF);

    type SimpleLog = { address: Address; data: string };
    const logs: SimpleLog[] = [
        { address: COORDINATOR, data: "direct-1" },
        { address: BATCH_VERIFIER, data: "batched-1" },
        { address: COORDINATOR, data: "direct-2" },
        { address: OTHER, data: "unrelated" },
        { address: BATCH_VERIFIER, data: "batched-2" },
    ];

    it("filters by single source address", () => {
        const direct = filterLogsBySource(logs, COORDINATOR);
        expect(direct).toHaveLength(2);
        expect(direct.every((l) => l.data.startsWith("direct"))).toBe(true);
    });

    it("filters by an array of accepted sources", () => {
        const both = filterLogsBySource(logs, [COORDINATOR, BATCH_VERIFIER]);
        expect(both).toHaveLength(4);
        expect(both.find((l) => l.data === "unrelated")).toBeUndefined();
    });

    it("is case-insensitive on the address comparison", () => {
        const upper = COORDINATOR.toUpperCase().replace("0X", "0x") as Address;
        const direct = filterLogsBySource(logs, upper);
        expect(direct).toHaveLength(2);
    });

    it("returns empty when no source matches", () => {
        expect(filterLogsBySource(logs, addr(0xDEAD))).toHaveLength(0);
        expect(filterLogsBySource(logs, [addr(0xDEAD), addr(0xBEEF)])).toHaveLength(0);
    });

    it("preserves the original log shape (does not mutate)", () => {
        const filtered = filterLogsBySource(logs, COORDINATOR);
        expect(filtered[0]).toBe(logs[0]); // same reference
        expect(filtered[1]).toBe(logs[2]);
    });
});

// ── buildProcessDisclosureSummary ───────────────────────────────────────────

describe("buildProcessDisclosureSummary", () => {
    it("aggregates GHG attestations for a process", () => {
        const events: AttestationEvent[] = [
            makeAttestation({
                processId: hex32(100),
                schemaId: GHG_SCHEMA_ID,
                stage: DisclosureKind.Commitment,
            }),
            makeAttestation({
                processId: hex32(100),
                schemaId: GHG_SCHEMA_ID,
                stage: DisclosureKind.Inventory,
                contentRef: encodeGramsRef(500n),
            }),
            makeAttestation({
                processId: hex32(100),
                schemaId: GHG_SCHEMA_ID,
                stage: DisclosureKind.Inventory,
                contentRef: encodeGramsRef(300n),
            }),
            // Different process — should be excluded
            makeAttestation({
                processId: hex32(999),
                schemaId: GHG_SCHEMA_ID,
                stage: DisclosureKind.Inventory,
                contentRef: encodeGramsRef(999n),
            }),
        ];

        const summary = buildProcessDisclosureSummary(events, hex32(100), GHG_SCHEMA_ID);
        expect(summary.processId).toBe(hex32(100));
        expect(summary.attestationCount).toBe(3);
        expect(summary.commitmentCount).toBe(1);
        expect(summary.inventoryCount).toBe(2);
        expect(summary.totalActualGrams).toBe(800n);
    });

    it("returns zeros when no matching events", () => {
        const summary = buildProcessDisclosureSummary([], hex32(100), GHG_SCHEMA_ID);
        expect(summary.attestationCount).toBe(0);
        expect(summary.totalActualGrams).toBe(0n);
    });
});
