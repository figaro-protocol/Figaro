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
    profile: {
        read: { status: "present", value: { registered: true, metadataURI: "ipfs://QmPriorProfile", registeredBlock: 1n } },
        refetch: () => Promise.resolve(),
    } as { read: unknown; refetch: () => Promise<void> },
    withdrawal: {
        pending: { status: "present", value: 0n },
        releaseAt: { status: "pending" },
        withdrawable: { status: "present", value: false },
        refetch: () => {},
    } as Record<string, unknown>,
    router: { push: () => {}, replace: vi.fn() },
    fetchProfile: vi.fn(),
    account: {} as { address?: string; isConnected: boolean; status: string },
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
    useAccount: () => mocks.account,
    usePublicClient: () => ({}),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/member/useMembersRegistry", async () => {
    const React = await import("react");
    return {
        useMemberProfile: () => mocks.profile,
        useRegistrationDeposit: () => ({ status: "present", value: 10n ** 16n }),
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
    fetchMemberProfile: () => mocks.fetchProfile(),
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

const REGISTERED = {
    read: { status: "present", value: { registered: true, metadataURI: "ipfs://QmPriorProfile", registeredBlock: 1n } },
    refetch: () => Promise.resolve(),
};

beforeEach(() => {
    mocks.account = { address: ADDRESS, isConnected: true, status: "connected" };
    mocks.profile = REGISTERED;
    mocks.withdrawal = {
        pending: { status: "present", value: 0n },
        releaseAt: { status: "pending" },
        withdrawable: { status: "present", value: false },
        refetch: () => {},
    };
    mocks.router.replace.mockReset();
    mocks.fetchProfile.mockReset();
    mocks.fetchProfile.mockResolvedValue({ name: "Seller", subjectAddress: ADDRESS });
});

describe("MemberLanding — a failed read renders nothing and takes no action", () => {
    it("a failed registration read never redirects to register again and shows no record", async () => {
        mocks.profile = { read: { status: "absent" }, refetch: () => Promise.resolve() };
        render(<MemberLanding />);
        await new Promise((r) => setTimeout(r, 20));
        expect(mocks.router.replace).not.toHaveBeenCalled();
        expect(screen.queryByText("Loading…")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("the chain's answer 'not registered', with nothing owed, redirects to Identity", async () => {
        mocks.profile = { read: { status: "present", value: { registered: false } }, refetch: () => Promise.resolve() };
        render(<MemberLanding />);
        await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/members/identity"));
    });

    it("a wallet still connecting after the page loads is not sent to Identity", async () => {
        // wagmi restores the wallet after the page loads: until it is done,
        // isConnected is false and no address is known. Nothing about the
        // wallet has been answered yet, so nothing redirects.
        mocks.account = { address: undefined, isConnected: false, status: "connecting" };
        mocks.profile = { read: { status: "pending" }, refetch: () => Promise.resolve() };
        render(<MemberLanding />);
        await new Promise((r) => setTimeout(r, 20));
        expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it("a wallet whose status is disconnected is sent to Identity", async () => {
        mocks.account = { address: undefined, isConnected: false, status: "disconnected" };
        mocks.profile = { read: { status: "pending" }, refetch: () => Promise.resolve() };
        render(<MemberLanding />);
        await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/members/identity"));
    });

    it("unregistered with a FAILED pending-deposit read: no redirect (owed ETH is never hidden behind it)", async () => {
        mocks.profile = { read: { status: "present", value: { registered: false } }, refetch: () => Promise.resolve() };
        mocks.withdrawal = { ...mocks.withdrawal, pending: { status: "absent" } };
        render(<MemberLanding />);
        await new Promise((r) => setTimeout(r, 20));
        expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it("a failed releaseAt read never says 'Released 1/1/1970'", async () => {
        mocks.withdrawal = {
            pending: { status: "present", value: 10n ** 16n },
            releaseAt: { status: "absent" },
            withdrawable: { status: "present", value: false },
            refetch: () => {},
        };
        render(<MemberLanding />);
        await screen.findByText(/ETH held for you/);
        expect(document.body.textContent).not.toMatch(/Released/);
        expect(document.body.textContent).not.toMatch(/1970/);
    });

    it("a profile document that fails to read shows no error text and no endless 'Loading profile…' heading", async () => {
        mocks.fetchProfile.mockRejectedValue(new Error("gateway timeout"));
        render(<MemberLanding />);
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(document.body.textContent).not.toMatch(/Loading profile|Couldn't/);
    });
});

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
