/**
 * The five shared network readers (R1–R5 of the failed-reads audit) on a read
 * that FAILS: each yields the one `absent` state of `NetworkRead`, never an
 * empty list, `undefined`, `null` or a default value a consumer could mistake
 * for data (docs/OPEN_WORLD.md § 1 "No fallbacks").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Abi } from "viem";

const mocks = vi.hoisted(() => ({
    cachedGetContractEvents: vi.fn(),
    getAllMemberRegistered: vi.fn(),
    getActiveMembers: vi.fn(),
    getMemberState: vi.fn(),
    getCoreEvents: vi.fn(),
    published: { status: "present", value: [] } as unknown,
}));

vi.mock("wagmi", () => ({
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useChainId: () => 31337,
    useAccount: () => ({ address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    useWatchContractEvent: () => undefined,
    useReadContract: () => ({ data: undefined }),
    useWriteContract: () => ({}),
    useWaitForTransactionReceipt: () => ({}),
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetContractEvents: (...a: unknown[]) => mocks.cachedGetContractEvents(...a),
}));
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({
    getAllMemberRegistered: (...a: unknown[]) => mocks.getAllMemberRegistered(...a),
    getActiveMembers: (...a: unknown[]) => mocks.getActiveMembers(...a),
    getMemberState: (...a: unknown[]) => mocks.getMemberState(...a),
}));
vi.mock("@/lib/core/indexer", () => ({
    getCoreEvents: (...a: unknown[]) => mocks.getCoreEvents(...a),
    useWatchOrderEvents: () => undefined,
    walletOrders: () => [],
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return {
        ...actual,
        CONTRACTS: {
            ...actual.CONTRACTS,
            core: "0x2222222222222222222222222222222222222222",
            membersRegistry: "0x1111111111111111111111111111111111111111",
        },
    };
});
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => ({ read: mocks.published, refetch: () => undefined }),
}));

import { createRegistryEventScan } from "@/lib/protocol/registryEventScan";
import { useRegisteredMembers } from "@/lib/member/useRegisteredMembers";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { fetchAgreement } from "@/lib/core/agreementFetch";
import { useProcessOrders, useWalletOrders } from "@/hooks/useProcessOrders";
import { useWalletProcessRows } from "@/lib/core/walletProcessQueries";
import type { DiscoveryService } from "@/lib/member/discoveryService";

const RPC_DOWN = new Error("fetch failed: RPC unreachable");
const PROCESS_ID = `0x${"ab".repeat(32)}`;

/** The one acceptable shape of a failed read. */
function expectAbsent(read: unknown) {
    expect(read).toEqual({ status: "absent" });
    expect(Array.isArray(read)).toBe(false);
    expect(read).not.toHaveProperty("value");
}

describe("a failed network read is `absent` in every shared reader", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mocks.cachedGetContractEvents.mockRejectedValue(RPC_DOWN);
        mocks.getAllMemberRegistered.mockRejectedValue(RPC_DOWN);
        mocks.getActiveMembers.mockRejectedValue(RPC_DOWN);
        mocks.getMemberState.mockRejectedValue(RPC_DOWN);
        mocks.getCoreEvents.mockRejectedValue(RPC_DOWN);
        mocks.published = { status: "present", value: [] };
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("R1 registry event scan: a failed scan is absent, never `[]`", async () => {
        const useScan = createRegistryEventScan<{ id: string }>({
            getRegistry: () => "0x3333333333333333333333333333333333333333",
            abi: [] as Abi,
            registeredEventName: "Registered",
            withdrawnEventName: "Withdrawn",
            label: "test",
            toRows: () => [],
        });
        const { result } = renderHook(() => useScan({}));
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
    });

    it("R1 registered members: a failed registry read is absent, never `[]`", async () => {
        const { result } = renderHook(() => useRegisteredMembers());
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
    });

    it("R2 registered catalogs: a failed catalog read is absent, never an empty catalog list", async () => {
        const service = {
            isRegistryConfigured: () => true,
            listCatalogs: vi.fn().mockRejectedValue(RPC_DOWN),
        } as unknown as DiscoveryService;
        const { result } = renderHook(() => useRegisteredCatalogs({ service }));
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
    });

    it("R2 registered catalogs: a failed assembly scan is absent, never 'every member rejected'", async () => {
        mocks.published = { status: "absent" };
        const listCatalogs = vi.fn().mockResolvedValue({ catalogs: [] });
        const service = { isRegistryConfigured: () => true, listCatalogs } as unknown as DiscoveryService;
        const { result } = renderHook(() => useRegisteredCatalogs({ service }));
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
        expect(listCatalogs).not.toHaveBeenCalled();
    });

    it("R3 member profile: a failed getMemberState is absent, never 'unregistered'", async () => {
        const { result } = renderHook(() => useMemberProfile("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
    });

    it("R4 agreement fetch: a gateway failure on a witnessed URI is absent, never null", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(RPC_DOWN));
        const transport = { pinJSON: vi.fn(), buildURI: (c: string) => `ipfs://${c}`, resolveFetchUrl: (u: string) => `https://gw.example/${u}` };
        const read = await fetchAgreement(`0x${"cd".repeat(32)}`, "ipfs://QmWitnessed", { evidenceTransport: transport });
        expectAbsent(read);
    });

    it("R5 process orders: a failed order scan is absent, never `[]`", async () => {
        const { result } = renderHook(() => useProcessOrders(PROCESS_ID));
        await waitFor(() => expect(result.current.status).not.toBe("pending"));
        expectAbsent(result.current);
    });

    it("R5 wallet orders: a failed order scan is absent, never `[]`", async () => {
        const { result } = renderHook(() => useWalletOrders());
        await waitFor(() => expect(result.current.status).not.toBe("pending"));
        expectAbsent(result.current);
    });

    it("R5 wallet process rows: a failed order scan is absent, never `[]`", async () => {
        const { result } = renderHook(() => useWalletProcessRows("seller"));
        await waitFor(() => expect(result.current.read.status).not.toBe("pending"));
        expectAbsent(result.current.read);
    });
});
