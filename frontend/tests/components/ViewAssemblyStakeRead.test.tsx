/**
 * The designer's assembly view reads the registry binding for the stake's state. An unread
 * stake is never shown as live: when the binding read fails, the page reports the failure
 * and offers no reclaim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const SLUG = "test-assembly";
const HASH = `0x${"ab".repeat(32)}` as const;
const REGISTRY = `0x${"11".repeat(20)}` as const;
const AUTHOR = `0x${"22".repeat(20)}` as const;
const readContract = vi.fn();
// Stable across renders, as the real hooks are: a new object per render would re-run the view's effect.
const client = { readContract };
const params = new URLSearchParams();
const router = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    useSearchParams: () => params,
}));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: AUTHOR }),
    useChainId: () => 31337,
    usePublicClient: () => client,
}));
vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetContractEvents: async () => [{ args: { assemblyHash: HASH, contentURI: "ipfs://x", registeredBy: AUTHOR } }],
}));
vi.mock("@/lib/designer/syntheticDesignStore", async (orig) => ({ ...(await orig<object>()), loadNamedDraft: () => null }));
vi.mock("@/lib/protocol/useAssemblyRegistry", async (orig) => ({
    ...(await orig<object>()),
    getAssemblyRegistry: () => REGISTRY,
    fetchHydratedAssembly: async () => ({ assembly: { name: "Test", agreements: [] }, agreements: [] }),
    useWithdrawAssembly: () => ({ withdraw: vi.fn() }),
}));
vi.mock("@/lib/protocol/withdrawGate", async (orig) => ({ ...(await orig<object>()), useWithdrawGate: () => ({ gate: null }) }));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAssembly: () => ({ publish: vi.fn() }) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 1 }) }));
vi.mock("@/lib/designer/assemblyToDraft", async (orig) => ({ ...(await orig<object>()), assemblyToOrders: () => [] }));
vi.mock("@/lib/shared/assembly", async (orig) => ({ ...(await orig<object>()), deriveAssemblySlug: () => SLUG }));
vi.mock("@/lib/protocol/useAgreementRegistry", async (orig) => ({
    ...(await orig<object>()),
    useRegisteredAgreementsVersion: () => 0,
    fetchRegisteredAgreement: vi.fn(),
}));
vi.mock("@/components/runtime/TopologyCanvas", () => ({ TopologyCanvas: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({ AgreementDrawer: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({ AssemblyTermsPanel: () => null }));

import { ViewAssemblyClient } from "@/app/(tools)/assemblies/designer/view/ViewAssemblyClient";

describe("the assembly view never surfaces an unread stake as live", () => {
    beforeEach(() => { readContract.mockReset(); });

    it("reports the failed binding read and offers no reclaim", async () => {
        readContract.mockImplementation(async () => { throw new Error("rpc unreachable"); });
        render(<ViewAssemblyClient slug={SLUG} />);
        await waitFor(() => expect(screen.getByTestId("assembly-view-error")).toBeTruthy());
        expect(screen.getByTestId("assembly-view-error").textContent).toContain("rpc unreachable");
        expect(screen.queryByTestId("view-withdraw-button")).toBeNull();
        expect(readContract).toHaveBeenCalledTimes(1);
    });

    it("renders the published view once the binding is read", async () => {
        readContract.mockResolvedValue([AUTHOR, 1n, false, "ipfs://x"]);
        render(<ViewAssemblyClient slug={SLUG} />);
        await waitFor(() => expect(screen.queryByTestId("assembly-view-loading")).toBeNull());
        expect(screen.queryByTestId("assembly-view-error")).toBeNull();
    });
});
