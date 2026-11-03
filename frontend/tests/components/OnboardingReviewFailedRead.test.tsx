/**
 * OnboardingReview — the register-or-update choice rests on the chain's
 * answer. A failed MembersRegistry read is never "unregistered": no "Publish &
 * register" button and no stake line are offered on it.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const reads = vi.hoisted(() => ({ registration: undefined as unknown }));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const STATE = {
    profile: { name: "Seller", defaultTokenAddress: "0x0000000000000000000000000000000000000001" },
    assemblies: [{ bindingId: "b", subjectAddress: ADDRESS, assemblyHash: `0x${"ab".repeat(32)}` }],
    catalog: { items: [{ id: "i", name: "Item", description: "", price: "1", available: true }] } as { items: unknown[] },
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ({ state: STATE, clear: vi.fn() }),
    onboardingStepLabel: (s: string) => s,
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    // Both shapes: the failed read as the old hook reported it, and as `absent`.
    useMemberProfile: () => ({ data: undefined, isLoading: false, read: reads.registration }),
    useRegistrationDeposit: () => ({ status: "present", value: 10n ** 16n, data: 10n ** 16n }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/member/usePublishMemberProfile", () => ({
    usePublishMemberProfile: () => ({ publish: vi.fn(), isPending: false, isConfirming: false, isSuccess: false, error: null }),
}));
vi.mock("@/components/shared/ContentImage", () => ({ ContentImage: () => null }));

import { OnboardingReview } from "@/components/members/OnboardingReview";

describe("OnboardingReview — a failed registration read offers no register/update choice", () => {
    it("absent: no 'Publish & register', no stake line", () => {
        reads.registration = { status: "absent" };
        render(<OnboardingReview />);
        expect(screen.queryByText("Publish & register")).toBeNull();
        expect(screen.queryByText("Update profile")).toBeNull();
        expect(screen.queryByText(/Stake:/)).toBeNull();
    });

    it("the chain's answer 'not registered': 'Publish & register' with the stake line", () => {
        reads.registration = { status: "present", value: { registered: false } };
        render(<OnboardingReview />);
        expect(screen.getByText("Publish & register")).toBeInTheDocument();
        expect(screen.getByText(/Stake:/)).toBeInTheDocument();
    });
});

describe("OnboardingReview — a member need not sell anything", () => {
    it("no catalog item: publishing is offered, with no 'add at least one item'", () => {
        reads.registration = { status: "present", value: { registered: false } };
        const items = STATE.catalog.items;
        STATE.catalog.items = [];
        try {
            render(<OnboardingReview />);
            expect(screen.getByText("Publish & register")).toBeInTheDocument();
            expect(screen.queryByText(/at least one item/i)).toBeNull();
        } finally {
            STATE.catalog.items = items;
        }
    });
});
