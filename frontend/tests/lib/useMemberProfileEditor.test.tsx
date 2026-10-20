/**
 * useMemberProfileEditor — the redirect back to /members/manage waits for the
 * whole save, the erasure of the superseded profile files included. A refused
 * unpin keeps the member on the edit page with the refusal shown, and the
 * message says the profile update itself stands.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const PROFILE = { name: "Seller", subjectAddress: ADDRESS };

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    unpin: vi.fn(),
    // Stable references: the hook's effects key on these reads' identity.
    registry: { data: ["ipfs://QmPriorProfile", 1n] as const, isLoading: false },
    onboarding: { update: () => {}, loaded: true },
}));

vi.mock("next/navigation", () => {
    const router = { push: mocks.push, replace: mocks.replace };
    return { useRouter: () => router };
});
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: ADDRESS, isConnected: true }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/member/useMembersRegistry", async () => {
    const React = await import("react");
    return {
        useMemberProfile: () => mocks.registry,
        // The update transaction confirms when `updateProfile` resolves.
        useUpdateProfile: () => {
            const [isSuccess, setIsSuccess] = React.useState(false);
            return {
                updateProfile: async () => {
                    setIsSuccess(true);
                },
                isPending: false,
                isConfirming: false,
                isSuccess,
                error: null,
                hash: undefined,
            };
        },
    };
});
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => mocks.onboarding,
}));
vi.mock("@/lib/member/profileFetcher", () => ({
    fetchMemberProfile: async () => PROFILE,
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: {
        publishJSON: async () => ({ uri: "ipfs://QmNextProfile" }),
    },
}));
vi.mock("@/lib/member/profileErasure", () => ({
    unpinSupersededProfileArtifacts: (...args: unknown[]) => mocks.unpin(...args),
}));

import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";

function renderEditor() {
    return renderHook(() => useMemberProfileEditor({ seed: () => {} }));
}

describe("useMemberProfileEditor — redirect after save", () => {
    beforeEach(() => {
        mocks.push.mockReset();
        mocks.replace.mockReset();
        mocks.unpin.mockReset();
    });

    it("redirects to /members/manage once the update and the unpin have completed", async () => {
        mocks.unpin.mockResolvedValue(undefined);
        const { result } = renderEditor();
        await waitFor(() => expect(result.current.gate).toBeNull());

        await act(async () => {
            await result.current.updater.save({ name: "Seller renamed" });
        });

        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/members/manage"));
        expect(result.current.externalError).toBeNull();
    });

    it("stays on the page and shows a refused unpin, saying the update stands", async () => {
        mocks.unpin.mockRejectedValue(new Error("The unpin of QmPriorProfile was refused."));
        const { result } = renderEditor();
        await waitFor(() => expect(result.current.gate).toBeNull());

        await act(async () => {
            await result.current.updater.save({ name: "Seller renamed" }).catch(() => {});
        });

        expect(result.current.updater.isSuccess).toBe(true);
        expect(mocks.push).not.toHaveBeenCalled();
        expect(result.current.externalError).toContain("The unpin of QmPriorProfile was refused.");
        expect(result.current.externalError).toMatch(/profile is updated/i);
    });
});
