/**
 * The wizard-step chrome every Onboarding*Form shares: the loading card and
 * the footer row (back link + submit).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingLoadingCard, OnboardingStepFooter } from "@/components/members/OnboardingStepChrome";

describe("OnboardingStepFooter", () => {
    it("links back to the step's default and submits with the default label", () => {
        render(<OnboardingStepFooter defaultBackHref="/members/identity" />);
        expect(screen.getByRole("link", { name: "← Back" }).getAttribute("href")).toBe("/members/identity");
        const submit = screen.getByRole("button", { name: "Next →" });
        expect(submit.getAttribute("type")).toBe("submit");
        expect((submit as HTMLButtonElement).disabled).toBe(false);
    });

    it("takes the caller's overrides, and holds the submit while it is in flight", () => {
        render(
            <OnboardingStepFooter
                defaultBackHref="/members/identity"
                backHref="/members/manage"
                backLabel="← Cancel"
                submitLabel="Save"
                submitInFlight
            />,
        );
        expect(screen.getByRole("link", { name: "← Cancel" }).getAttribute("href")).toBe("/members/manage");
        const submit = screen.getByRole("button", { name: "Saving…" });
        expect((submit as HTMLButtonElement).disabled).toBe(true);
    });
});

describe("OnboardingLoadingCard", () => {
    it("says it is loading", () => {
        render(<OnboardingLoadingCard />);
        expect(screen.getByText("Loading…")).toBeTruthy();
    });
});
