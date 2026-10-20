/**
 * MemberLanding — leaving the registry. The withdrawal request confirms and
 * the receipt view renders; the erasure of the member's profile files follows.
 * A refused unpin is shown inside the receipt view, and the message says the
 * withdrawal request itself stands.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const TX = `0x${"ab".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
    unpin: vi.fn(),
    // Stable references: the component's effects key on these reads' identity.
    profile: { data: ["ipfs://QmPriorProfile", 1n] as const, isLoading: false, refetch: () => Promise.resolve() },
    withdrawal: { pending: 0n, releaseAt: undefined, withdrawable: false, isLoading: false, refetch: () => {} },
    router: { push: () => {}, replace: () => {} },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
    };
});
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: ADDRESS, isConnected: true }),
    usePublicClient: () => ({}),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/member/useMembersRegistry", async () => {
    const React = await import("react");
    return {
        useMemberProfile: () => mocks.profile,
        useRegistrationDeposit: () => ({ data: 10n ** 16n }),
        useWithdrawalStatus: () => mocks.withdrawal,
        useWithdrawalCooldown: () => ({ data: 60n }),
        useWithdrawDeposit: () => ({ withdraw: async () => TX, isPending: false, isConfirming: false, error: null }),
        // The request confirms when `requestWithdrawal` resolves.
        useRequestWithdrawal: () => {
            const [hash, setHash] = React.useState<`0x${string}` | undefined>(undefined);
            return {
                requestWithdrawal: async () => {
                    setHash(TX);
                },
                isPending: false,
                isConfirming: false,
                isSuccess: hash !== undefined,
                hash,
                error: null,
            };
        },
    };
});
vi.mock("@/lib/member/profileFetcher", () => ({
    fetchMemberProfile: async () => ({ name: "Seller", subjectAddress: ADDRESS }),
}));
vi.mock("@/lib/member/profileErasure", () => ({
    unpinSupersededProfileArtifacts: (...args: unknown[]) => mocks.unpin(...args),
}));

import { MemberLanding } from "@/components/members/MemberLanding";

async function leave() {
    render(<MemberLanding />);
    await screen.findByRole("heading", { name: "Seller" });
    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and leave" }));
    await screen.findByText("You have left the registry.");
}

describe("MemberLanding — leaving the registry", () => {
    beforeEach(() => {
        mocks.unpin.mockReset();
    });

    it("shows the receipt with no alert when the unpin succeeds", async () => {
        mocks.unpin.mockResolvedValue(undefined);
        await leave();
        await waitFor(() => expect(mocks.unpin).toHaveBeenCalled());
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows a refused unpin inside the receipt view, saying the request stands", async () => {
        mocks.unpin.mockRejectedValue(new Error("The unpin of QmPriorProfile was refused."));
        await leave();
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("The unpin of QmPriorProfile was refused.");
        expect(alert.textContent).toMatch(/you have left the registry/i);
        // Still the receipt view: the dismissal is there.
        expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    });
});
