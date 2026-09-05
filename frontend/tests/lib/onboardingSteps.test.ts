import { describe, it, expect } from "vitest";
import {
    ONBOARDING_STEPS,
    onboardingNextHref,
    onboardingPrevHref,
    onboardingStepHref,
} from "@/lib/member/onboardingState";

// The wizard's order: the assemblies a seller binds decide which clauses
// their trades carry, so Assemblies precedes Catalogue; the buyer page sits
// between the seller's steps and the agents step, so the agents step delegates
// control of the member's WHOLE profile — seller and buyer alike.
describe("ONBOARDING_STEPS — member wizard order", () => {
    it("runs identity → assemblies → catalogue → buyer → agents → endpoints → review (no welcome — /join owns the pitch; the bindings decide the catalogue's clause fields)", () => {
        expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
            "profile",
            "assemblies",
            "catalogue",
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

// Every step's Next/Back reads the order above rather than naming a sibling,
// so a reorder moves the walk with it and can't leave a form pointing at the
// step that used to follow it.
describe("wizard navigation derives from the step order", () => {
    it("routes each step to its own URL under /members", () => {
        expect(onboardingStepHref("profile")).toBe("/members/identity");
        expect(onboardingStepHref("assemblies")).toBe("/members/assemblies");
        expect(onboardingStepHref("review")).toBe("/members/review");
    });

    it("walks forward in ONBOARDING_STEPS order", () => {
        const walk: string[] = [];
        for (const step of ONBOARDING_STEPS) walk.push(onboardingNextHref(step.id));
        expect(walk).toEqual([
            "/members/assemblies",
            "/members/catalogue",
            "/members/buyer",
            "/members/agents",
            "/members/endpoints",
            "/members/review",
            // The last step has no successor: publishing, not another step.
            "/members/review",
        ]);
    });

    it("walks back in ONBOARDING_STEPS order and stops at the first step", () => {
        expect(onboardingPrevHref("assemblies")).toBe("/members/identity");
        expect(onboardingPrevHref("catalogue")).toBe("/members/assemblies");
        expect(onboardingPrevHref("buyer")).toBe("/members/catalogue");
        expect(onboardingPrevHref("profile")).toBe("/members/identity");
    });

    it("next and back are inverses across every adjacent pair", () => {
        for (let i = 1; i < ONBOARDING_STEPS.length; i++) {
            const prev = ONBOARDING_STEPS[i - 1];
            const here = ONBOARDING_STEPS[i];
            expect(onboardingNextHref(prev.id)).toBe(onboardingStepHref(here.id));
            expect(onboardingPrevHref(here.id)).toBe(onboardingStepHref(prev.id));
        }
    });
});
