/**
 * `/members/review` with no wallet. The visitor's draft is the anonymous one
 * (`lib/member/onboardingState.ts`), filled without a wallet: the review shows
 * it as it stands, with no subject address and no stand-in for one. A wallet
 * that connects adopts the anonymous draft and the anonymous copy is removed,
 * so after a disconnect it is usually empty: an empty draft is an empty
 * place, never an "incomplete" error. The registration stake is read from
 * `MembersRegistry` with no address and shows apart from the registration
 * read, which needs a wallet; whether publishing would register or update is
 * unknown until one connects, so neither heading is claimed. Only the publish
 * needs the wallet, and its control says so.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: undefined, isConnected: false }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
const FILLED = {
    profile: { name: "Seller", defaultTokenAddress: "0x0000000000000000000000000000000000000001" },
    assemblies: [],
    catalog: { items: [{ id: "i", name: "Item", description: "", price: "1", available: true }] },
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ({ state: m.state, clear: vi.fn() }),
    onboardingStepLabel: (s: string) => s,
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    // With no wallet the registration read has no subject and stays pending.
    useMemberProfile: () => ({ read: { status: "pending" } }),
    useRegistrationDeposit: () => ({ status: "present", value: 10n ** 16n }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/member/usePublishMemberProfile", () => ({
    usePublishMemberProfile: () => ({ publish: vi.fn(), isPending: false, isConfirming: false, isSuccess: false, error: null }),
}));
vi.mock("@/components/shared/ContentImage", () => ({ ContentImage: () => null }));

import { OnboardingReview } from "@/components/members/OnboardingReview";

beforeEach(() => {
    m.state = FILLED;
});

describe("/members/review — no wallet, the draft and the stake read present", () => {
    it("no wallet, read present: the draft's name and item and the registration stake show", () => {
        const { container } = render(<OnboardingReview />);
        expect(container.textContent).toMatch(/Seller/);
        expect(container.textContent).toMatch(/Item/);
        expect(screen.getByText(/Stake:/)).toBeInTheDocument();
    });

    it("claims neither a first registration nor an update, and the publish says it needs a wallet", () => {
        const { container } = render(<OnboardingReview />);
        expect(container.textContent).not.toMatch(/Publish & register|Update profile|Update your registered profile/);
        expect((screen.getByTestId("review-confirm-publish") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("review-publish-needs-wallet").textContent).toMatch(/connect one to publish/);
    });

    it("an unbound draft shows as it stands: no 'incomplete' error", () => {
        render(<OnboardingReview />);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("an empty anonymous draft is an empty place: no preview, no error; the stake still shows", () => {
        m.state = {};
        const { container } = render(<OnboardingReview />);
        expect(container.textContent).not.toMatch(/incomplete|required|Preview/i);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByTestId("review-registration-stake").textContent).toMatch(/Stake:/);
    });
});
