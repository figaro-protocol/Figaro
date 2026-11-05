/**
 * OnboardingBuyerForm — the Buy through step on the shared wizard chrome:
 * before mount the shared loading card; mounted, the footer links back to the
 * step before Buy through and submits as "Next →", advancing to the step after
 * it; in edit mode it takes the caller's back link, labels and in-flight
 * state, and saves the subscriptions through `onSave` instead of advancing.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const SUBSCRIBED = `0x${"ab".repeat(32)}` as const;

const m = vi.hoisted(() => ({ mounted: true, push: (() => {}) as (href: string) => void, onboarding: undefined as unknown }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => m.push(href) }) }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => m.mounted }));
vi.mock("@/lib/member/onboardingState", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/onboardingState")>()),
    useOnboardingState: () => m.onboarding,
}));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/components/members/AssemblyChoiceRow", () => ({ AssemblyChoiceRow: () => null }));

import { OnboardingBuyerForm } from "@/components/members/OnboardingBuyerForm";
import { onboardingNextHref, onboardingPrevHref } from "@/lib/member/onboardingState";

beforeEach(() => {
    m.mounted = true;
    m.push = vi.fn();
    // The member's saved draft: one assembly subscribed. One object across
    // renders, as the hook keeps it.
    m.onboarding = { state: { buyerAssemblies: [{ assemblyHash: SUBSCRIBED }] }, loaded: true, subject: ADDRESS, update: vi.fn() };
});

describe("OnboardingBuyerForm — the wizard chrome", () => {
    it("before mount, shows the shared loading card and nothing else", () => {
        m.mounted = false;
        const { container } = render(<OnboardingBuyerForm />);
        expect(container.textContent).toBe("Loading…");
    });

    it("in the wizard, links back to the step before Buy through and advances to the step after it", () => {
        render(<OnboardingBuyerForm />);
        expect(screen.getByRole("link", { name: "← Back" }).getAttribute("href")).toBe(onboardingPrevHref("buyer"));
        fireEvent.click(screen.getByRole("button", { name: "Next →" }));
        expect(m.push).toHaveBeenCalledWith(onboardingNextHref("buyer"));
    });

    it("in edit mode, takes the caller's back link, labels and in-flight state", () => {
        render(<OnboardingBuyerForm onSave={vi.fn()} backHref="/members/manage" backLabel="← Cancel" submitLabel="Save changes" submitInFlight />);
        expect(screen.getByRole("link", { name: "← Cancel" }).getAttribute("href")).toBe("/members/manage");
        expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("in edit mode, saves the subscriptions through onSave and does not advance", async () => {
        const onSave = vi.fn(async () => undefined);
        render(<OnboardingBuyerForm onSave={onSave} submitLabel="Save changes" />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
        expect(onSave).toHaveBeenCalledWith([{ assemblyHash: SUBSCRIBED }]);
        expect(m.push).not.toHaveBeenCalled();
    });
});
