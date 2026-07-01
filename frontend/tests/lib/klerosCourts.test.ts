import { describe, expect, it } from "vitest";
import {
    KLEROS_COURTS,
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

    it("every court has a positive defaultMinJurors", () => {
        for (const court of KLEROS_COURTS) {
            expect(court.defaultMinJurors).toBeGreaterThanOrEqual(1);
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
