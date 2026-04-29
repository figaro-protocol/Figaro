import { describe, expect, it } from "vitest";
import {
    KLEROS_COURTS,
    KLEROS_COURT_KEYS,
    KLEROS_MIN_JURORS_FLOOR,
    encodeArbitratorExtraData,
    getKlerosCourt,
} from "@/lib/dispute/klerosCourts";

describe("KLEROS_COURTS catalog", () => {
    it("has unique stable keys", () => {
        const keys = KLEROS_COURTS.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("has unique IDs", () => {
        const ids = KLEROS_COURTS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("includes the General Court as a baseline", () => {
        const general = KLEROS_COURTS.find((c) => c.key === "general");
        expect(general).toBeDefined();
        expect(general?.id).toBeGreaterThan(0);
    });

    it("KLEROS_COURT_KEYS matches the catalog", () => {
        expect(KLEROS_COURT_KEYS).toEqual(KLEROS_COURTS.map((c) => c.key));
    });

    it("every court has defaultMinJurors >= floor", () => {
        for (const court of KLEROS_COURTS) {
            expect(court.defaultMinJurors).toBeGreaterThanOrEqual(KLEROS_MIN_JURORS_FLOOR);
        }
    });
});

describe("getKlerosCourt", () => {
    it("returns the court for a known key", () => {
        const c = getKlerosCourt("general");
        expect(c).not.toBeNull();
        expect(c?.name).toMatch(/General/);
    });

    it("returns null for an unknown key", () => {
        expect(getKlerosCourt("nope")).toBeNull();
    });
});

describe("encodeArbitratorExtraData", () => {
    it("produces 64 bytes (130 hex chars) of output", () => {
        const encoded = encodeArbitratorExtraData(1, 3);
        // 0x + 64 bytes = 0x + 128 hex chars
        expect(encoded).toMatch(/^0x[0-9a-f]{128}$/);
    });

    it("is deterministic", () => {
        expect(encodeArbitratorExtraData(1, 3)).toBe(encodeArbitratorExtraData(1, 3));
    });

    it("differs across courts", () => {
        expect(encodeArbitratorExtraData(1, 3)).not.toBe(encodeArbitratorExtraData(2, 3));
    });

    it("differs across juror counts", () => {
        expect(encodeArbitratorExtraData(1, 3)).not.toBe(encodeArbitratorExtraData(1, 5));
    });

    it("rejects negative court IDs", () => {
        expect(() => encodeArbitratorExtraData(-1, 3)).toThrow(/non-negative/);
    });

    it("rejects zero or negative juror counts", () => {
        expect(() => encodeArbitratorExtraData(1, 0)).toThrow(/positive/);
        expect(() => encodeArbitratorExtraData(1, -1)).toThrow(/positive/);
    });

    it("rejects non-integer inputs", () => {
        expect(() => encodeArbitratorExtraData(1.5, 3)).toThrow(/integer/);
        expect(() => encodeArbitratorExtraData(1, 3.5)).toThrow(/integer/);
    });
});
