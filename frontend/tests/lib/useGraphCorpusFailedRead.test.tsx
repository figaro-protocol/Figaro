/**
 * useGraphCorpus — a failed clause-registry read makes the corpus absent, not
 * pending for ever: a surface renders nothing for it instead of a loading
 * state for a read that is not in flight (docs/OPEN_WORLD.md § 1).
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { NO_ASSEMBLIES, SPECS } = vi.hoisted(() => ({
    NO_ASSEMBLIES: { read: { status: "present" as const, value: [] }, refetch: () => undefined },
    SPECS: { version: 0, loaded: false, failed: true },
}));
vi.mock("wagmi", () => ({
    useChainId: () => 31337,
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useAccount: () => ({ address: undefined, isConnected: false }),
    useWatchContractEvent: () => undefined,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => SPECS }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => NO_ASSEMBLIES }));

import { useGraphCorpus } from "@/lib/data/graphCorpus";

describe("useGraphCorpus — a failed clause-spec read", () => {
    it("reads as absent, never as pending", async () => {
        const { result } = renderHook(() => useGraphCorpus());
        await waitFor(() => expect(result.current.status).toBe("absent"));
    });
});
