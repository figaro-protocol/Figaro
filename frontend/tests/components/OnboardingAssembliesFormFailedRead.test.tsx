/**
 * OnboardingAssembliesForm — a failed AssemblyRegistry read is never "nothing
 * to bind": the autosave does not run on it, so the seller's bindings in the
 * draft are never overwritten with `assemblies: []`.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const BOUND = `0x${"ab".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
    update: vi.fn(),
    cachedGetContractEvents: vi.fn(),
}));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: (...a: unknown[]) => mocks.cachedGetContractEvents(...a),
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, assemblyRegistry: "0x3333333333333333333333333333333333333333" } };
});
// The seller's saved draft: one assembly bound.
const ONBOARDING = {
    state: { assemblies: [{ bindingId: `binding:${ADDRESS}:${BOUND}`, subjectAddress: ADDRESS, assemblyHash: BOUND }] },
    loaded: true,
    subject: ADDRESS,
    update: mocks.update,
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ONBOARDING,
    onboardingNextHref: () => "/next",
    onboardingPrevHref: () => "/prev",
}));
vi.mock("@/components/members/DisclosurePolicyEditor", () => ({ DisclosurePolicyEditor: () => null }));
vi.mock("@/components/members/ProfileClauseValues", () => ({ ProfileClauseValues: () => null }));
vi.mock("@/components/members/PinnedTokenNote", () => ({ PinnedTokenNote: () => null }));
vi.mock("@/components/members/AssemblyChoiceRow", () => ({ AssemblyChoiceRow: () => null }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));

import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

describe("OnboardingAssembliesForm — a failed registry read takes no action", () => {
    it("the AssemblyRegistry read fails: no autosave wipes the seller's bindings", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.cachedGetContractEvents.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        render(<OnboardingAssembliesForm />);
        await waitFor(() => expect(mocks.cachedGetContractEvents).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        const wiped = mocks.update.mock.calls.some(
            ([patch]) => Array.isArray((patch as { assemblies?: unknown[] }).assemblies)
                && (patch as { assemblies: unknown[] }).assemblies.length === 0,
        );
        expect(wiped).toBe(false);
    });
});
