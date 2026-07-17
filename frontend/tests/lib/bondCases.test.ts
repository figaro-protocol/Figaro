import { describe, it, expect } from "vitest";
import {
    deriveBondCasePhase,
    bondCaseRulingLabel,
    CASE_STATUS_OPEN,
    CASE_STATUS_DISPUTED,
    CASE_STATUS_CLOSED,
    RULING_REFUSED,
    RULING_POSTER,
    RULING_CHALLENGER,
} from "@/lib/composition/bondCases";

const WINDOW = 600n; // seconds
const AT = 1_000_000n;

describe("deriveBondCasePhase", () => {
    it("an open case inside the dispute window is escalatable", () => {
        const c = { status: CASE_STATUS_OPEN, challengedAt: AT };
        expect(deriveBondCasePhase(c, AT, WINDOW)).toBe("escalatable");
        expect(deriveBondCasePhase(c, AT + WINDOW - 1n, WINDOW)).toBe("escalatable");
    });

    it("an open case at/after window end is concedable (boundary is >=, matching DisputeWindowClosed)", () => {
        const c = { status: CASE_STATUS_OPEN, challengedAt: AT };
        expect(deriveBondCasePhase(c, AT + WINDOW, WINDOW)).toBe("concedable");
        expect(deriveBondCasePhase(c, AT + WINDOW + 1n, WINDOW)).toBe("concedable");
    });

    it("a disputed case is disputed regardless of the clock", () => {
        const c = { status: CASE_STATUS_DISPUTED, challengedAt: AT };
        expect(deriveBondCasePhase(c, AT, WINDOW)).toBe("disputed");
        expect(deriveBondCasePhase(c, AT + WINDOW * 10n, WINDOW)).toBe("disputed");
    });

    it("a closed case is closed regardless of the clock", () => {
        const c = { status: CASE_STATUS_CLOSED, challengedAt: AT };
        expect(deriveBondCasePhase(c, AT, WINDOW)).toBe("closed");
    });
});

describe("bondCaseRulingLabel", () => {
    it("concession wins over any ruling code in the label", () => {
        expect(bondCaseRulingLabel({ ruling: null, conceded: true })).toMatch(/conceded/);
    });

    it("each ruling code gets its own line", () => {
        expect(bondCaseRulingLabel({ ruling: RULING_POSTER, conceded: false })).toMatch(/for the poster/);
        expect(bondCaseRulingLabel({ ruling: RULING_CHALLENGER, conceded: false })).toMatch(/for the challenger/);
        expect(bondCaseRulingLabel({ ruling: RULING_REFUSED, conceded: false })).toMatch(/refused/);
    });

    it("a closed case with no ruling event yet falls back to plain closed", () => {
        expect(bondCaseRulingLabel({ ruling: null, conceded: false })).toBe("closed");
    });
});
