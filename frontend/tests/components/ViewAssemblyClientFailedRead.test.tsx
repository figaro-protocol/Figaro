/**
 * ViewAssemblyClient — only a registration whose stake is read surfaces. A
 * failed `AssemblyRegistry.bindings` read renders nothing, so the page never
 * offers "Reclaim stake" on a live-stake assumption built from the event's
 * registeredBy; a read binding offers the author the reclaim.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { deriveAssemblySlug } from "@/lib/shared/assembly";

const AUTHOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const SLUG = deriveAssemblySlug(HASH);

const mocks = vi.hoisted(() => ({ readContract: vi.fn() }));
const CLIENT = { chain: { id: 31337 }, readContract: (...a: unknown[]) => mocks.readContract(...a) };

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: AUTHOR }),
    useChainId: () => 31337,
    usePublicClient: () => CLIENT,
}));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: async () => [{ args: { assemblyHash: HASH, contentURI: "ipfs://a", registeredBy: AUTHOR } }],
}));
vi.mock("@/lib/protocol/useAssemblyRegistry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/protocol/useAssemblyRegistry")>()),
    getAssemblyRegistry: () => "0x3333333333333333333333333333333333333333",
    fetchHydratedAssembly: async () => ({ assembly: { name: "Point of sale", agreements: [] }, agreements: {} }),
    useWithdrawAssembly: () => ({ withdraw: vi.fn() }),
}));
vi.mock("@/lib/protocol/withdrawGate", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/protocol/withdrawGate")>();
    const gate = { status: "present", value: { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 } };
    return { ...actual, useWithdrawGate: () => ({ gate }) };
});
vi.mock("@/lib/designer/assemblyToDraft", () => ({ assemblyToOrders: () => [] }));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAssembly: () => ({ publish: vi.fn() }) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/TopologyCanvas", () => ({ TopologyCanvas: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({ AgreementDrawer: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({ AssemblyTermsPanel: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyIdentity", () => ({ AssemblyIdentity: () => null }));

import { ViewAssemblyClient } from "@/app/(tools)/assemblies/designer/view/ViewAssemblyClient";

describe("ViewAssemblyClient — a failed binding read surfaces nothing", () => {
    it("bindings read fails: nothing renders, so no 'Reclaim stake' for the event's registeredBy", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.readContract.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        const { container } = render(<ViewAssemblyClient slug={SLUG} />);
        await waitFor(() => expect(mocks.readContract).toHaveBeenCalled());
        await waitFor(() => expect(container.innerHTML).toBe(""));
        expect(screen.queryByTestId("view-fork-button")).toBeNull();
        expect(screen.queryByTestId("view-withdraw-button")).toBeNull();
    });

    it("bindings read answers: the author is offered the reclaim", async () => {
        mocks.readContract.mockResolvedValue([AUTHOR, 1n, false, "ipfs://a"]);
        render(<ViewAssemblyClient slug={SLUG} />);
        await screen.findByTestId("view-withdraw-button");
    });
});
