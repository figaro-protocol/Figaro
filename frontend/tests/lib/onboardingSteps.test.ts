import { describe, it, expect } from "vitest";
import { ONBOARDING_STEPS } from "@/lib/member/onboardingState";

// The wizard's ruled order (operator, 2026-08-06): the buyer page sits
// between the seller assemblies step and the agents step, so the agents
// step delegates control of the member's WHOLE profile — seller and
// buyer alike.
describe("ONBOARDING_STEPS — member wizard order", () => {
    it("runs identity → catalogue → assemblies → buyer → agents → endpoints → review (no welcome — /join owns the pitch)", () => {
        expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
            "profile",
            "catalogue",
            "assemblies",
            "buyer",
            "agents",
            "endpoints",
            "review",
        ]);
    });

    it("numbers the steps contiguously for the indicator", () => {
        expect(ONBOARDING_STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("keeps the buyer step optional — a member who only sells skips it", () => {
        const buyer = ONBOARDING_STEPS.find((s) => s.id === "buyer");
        expect(buyer?.optional).toBe(true);
        expect(buyer?.path).toBe("buyer");
    });
});
