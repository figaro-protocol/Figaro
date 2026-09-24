import { describe, expect, it } from "vitest";
import { cooldownPhrase } from "@/components/members/OnboardingReview";

/**
 * The wizard's review quotes the deposit and the delay it is locked for from
 * the chain. Beta r4's freelancer and potter read "with no cooldown" against
 * the FAQ's "a delay fixed at deployment" and saw a contradiction; the phrase
 * now says whose delay it is, in every branch.
 */
describe("cooldownPhrase", () => {
    it("says a zero delay is this deployment's, fixed at zero", () => {
        expect(cooldownPhrase(0n)).toBe("at once; the cooldown here is zero");
    });
    it("names the delay as this deployment's when it is days", () => {
        expect(cooldownPhrase(28n * 86_400n)).toBe("after 28 days, the cooldown this chain sets");
        expect(cooldownPhrase(86_400n)).toBe("after 1 day, the cooldown this chain sets");
    });
    it("names the delay as this deployment's when it is hours", () => {
        expect(cooldownPhrase(5_400n)).toBe("after 1.5 hours, the cooldown this chain sets");
    });
    it("keeps the same frame while the read has not landed", () => {
        expect(cooldownPhrase(undefined)).toBe("after the cooldown this chain sets");
    });
});
