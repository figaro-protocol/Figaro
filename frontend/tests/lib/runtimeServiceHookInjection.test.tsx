/**
 * Runtime services are injected, never reached for: a hook handed a service
 * (by option or through `RuntimeServicesProvider`) uses that one, and the
 * default is never called. Every stub here is typed against the real service
 * interface (`satisfies`), so a stub naming a method the service does not have,
 * or missing one it does, fails to compile; every assertion is one the default
 * path would fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PublicClient } from "viem";
import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import { RuntimeServicesProvider, useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { DEFAULT_RUNTIME_SERVICES, type RuntimeServices } from "@/lib/shared/runtimeServices";
import type { MemberCatalog } from "@/lib/member/types";
import type { DiscoveryService } from "@/lib/member/discoveryService";
import type { HandoffPersistenceService } from "@/lib/handoff/handoffPersistenceService";
import type { IpfsService } from "@/lib/shared/ipfsService";

const WALLET = "0x1234567890123456789012345678901234567890";
const watchContractEventMock = vi.fn();
const publicClient = {
    getBlockNumber: vi.fn(async () => 100n),
    watchContractEvent: (...args: unknown[]) => watchContractEventMock(...args),
};

vi.mock("wagmi", () => ({
    usePublicClient: () => publicClient,
    useChainId: () => 31337,
    useAccount: () => ({ address: WALLET }),
}));

// The surfacing rule's AssemblyRegistry cross-check — resolved (empty) so the
// catalog read proceeds. One stable reference: the hook keys on its identity.
const PUBLISHED = vi.hoisted(() => ({ read: { status: "present", value: [] as unknown[] } }));
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({ usePublishedAssemblies: () => PUBLISHED }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

const injectedMember: MemberCatalog = {
    name: "Injected Member",
    description: "Injected discovery result",
    specialty: "Ceramics",
    image: "",
    address: "0x0000000000000000000000000000000000000011",
    items: [],
    acceptedTokens: [],
};

const wrapperFor = (services: RuntimeServices) =>
    function Wrapper({ children }: { children: ReactNode }) {
        return <RuntimeServicesProvider services={services}>{children}</RuntimeServicesProvider>;
    };

beforeEach(() => {
    watchContractEventMock.mockReset();
    watchContractEventMock.mockReturnValue(() => undefined);
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("runtime service injection", () => {
    it("useRegisteredCatalogs reads through the injected discovery service, never the default", async () => {
        const defaultList = vi.spyOn(DEFAULT_RUNTIME_SERVICES.discovery, "listCatalogs");
        const defaultConfigured = vi.spyOn(DEFAULT_RUNTIME_SERVICES.discovery, "isRegistryConfigured");
        const service = {
            isRegistryConfigured: vi.fn(() => true),
            listCatalogs: vi.fn(async () => ({ catalogs: [injectedMember] })),
        } satisfies DiscoveryService;

        const { result } = renderHook(() => useRegisteredCatalogs({ service }));

        await waitFor(() => expect(result.current.read).toEqual({ status: "present", value: [injectedMember] }));
        expect(service.listCatalogs).toHaveBeenCalledWith(publicClient as unknown as PublicClient, 31337, new Set());
        expect(defaultList).not.toHaveBeenCalled();
        expect(defaultConfigured).not.toHaveBeenCalled();
    });

    it("an injected discovery service that says the registry is unconfigured is not read", async () => {
        const service = {
            isRegistryConfigured: vi.fn(() => false),
            listCatalogs: vi.fn(async () => ({ catalogs: [injectedMember] })),
        } satisfies DiscoveryService;
        const { result } = renderHook(() => useRegisteredCatalogs({ service }));
        await waitFor(() => expect(result.current.read).toEqual({ status: "absent" }));
        expect(service.isRegistryConfigured).toHaveBeenCalled();
        expect(service.listCatalogs).not.toHaveBeenCalled();
    });

    it("the provider hands its consumers the injected evidence transport, not the default", () => {
        // A distinct object with the real IpfsService's methods.
        const evidenceTransport: IpfsService = Object.create(DEFAULT_RUNTIME_SERVICES.evidenceTransport);
        const services = { ...DEFAULT_RUNTIME_SERVICES, evidenceTransport } satisfies RuntimeServices;

        const { result } = renderHook(() => useRuntimeServices(), { wrapper: wrapperFor(services) });

        expect(result.current.evidenceTransport).toBe(evidenceTransport);
        expect(result.current.evidenceTransport).not.toBe(DEFAULT_RUNTIME_SERVICES.evidenceTransport);
    });

    it("useHandoffCleanup sweeps and purges through the injected persistence service, never the default", async () => {
        const defaultSweep = vi.spyOn(DEFAULT_RUNTIME_SERVICES.handoffPersistence, "sweepDuePurges");
        const defaultSchedule = vi.spyOn(DEFAULT_RUNTIME_SERVICES.handoffPersistence, "schedulePurge");
        const handoffPersistence = {
            purgeHandoffArtifacts: vi.fn(),
            schedulePurge: vi.fn(),
            sweepDuePurges: vi.fn(),
        } satisfies HandoffPersistenceService;
        const services = { ...DEFAULT_RUNTIME_SERVICES, handoffPersistence } satisfies RuntimeServices;

        renderHook(() => useHandoffCleanup(), { wrapper: wrapperFor(services) });

        await waitFor(() => expect(handoffPersistence.sweepDuePurges).toHaveBeenCalledWith(WALLET));
        // ONE watcher, on OrderResolved: resolveProcess emits it per order.
        await waitFor(() => expect(watchContractEventMock).toHaveBeenCalledTimes(1));
        const [{ eventName, onLogs }] = watchContractEventMock.mock.calls[0] as [{ eventName: string; onLogs: (logs: unknown[]) => void }];
        expect(eventName).toBe("OrderResolved");

        // The chain resolves an order: its key material is purged through the injected service.
        act(() => onLogs([{ args: { orderHash: `0x${"0d".repeat(32)}`, processId: `0x${"ab".repeat(32)}` } }]));
        expect(handoffPersistence.schedulePurge).toHaveBeenCalledWith(WALLET, `0x${"ab".repeat(32)}`, `0x${"0d".repeat(32)}`, 0);

        // The same resolution delivered again is purged once.
        act(() => onLogs([{ args: { orderHash: `0x${"0d".repeat(32)}`, processId: `0x${"ab".repeat(32)}` } }]));
        expect(handoffPersistence.schedulePurge).toHaveBeenCalledTimes(1);

        expect(defaultSweep).not.toHaveBeenCalled();
        expect(defaultSchedule).not.toHaveBeenCalled();
    });
});
