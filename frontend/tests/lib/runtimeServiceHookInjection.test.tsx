import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import {
    RuntimeServicesProvider,
    useRuntimeServices,
} from "@/lib/shared/runtimeServicesContext";
import type { SellerCatalogue } from "@/lib/seller/types";
import type { DiscoveryService } from "@/lib/seller/discoveryService";
import type { IpfsService } from "@/lib/shared/ipfsService";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";

const usePublicClientMock = vi.fn();
const useChainIdMock = vi.fn();
const useAccountMock = vi.fn();
const useWalletClientMock = vi.fn();
const getSellerMetadataURIMock = vi.fn();
const getBlockNumberMock = vi.fn();
const watchContractEventMock = vi.fn();
const defaultFetchSellerCatalogueMock = vi.fn();
const defaultListFallbackRestaurantsMock = vi.fn();
const defaultIsRegistryConfiguredMock = vi.fn();
const defaultListRestaurantsMock = vi.fn();
const defaultIpfsPinJSONMock = vi.fn();
const defaultIpfsBuildPathMock = vi.fn();
const defaultSendHandoffKeyMock = vi.fn();
const defaultSubscribeHandoffKeyMock = vi.fn();
const defaultSubscribeEcdhPubkeyMock = vi.fn();
const defaultSendWrappedKeyMock = vi.fn();
const defaultSendEcdhPubkeyMock = vi.fn();
const defaultSubscribeWrappedKeyMock = vi.fn();
const defaultSaveHandoffKeyMock = vi.fn();
const defaultGetHandoffKeyMock = vi.fn();
const defaultRemoveHandoffKeyMock = vi.fn();
const defaultSavePendingHandoffIntentMock = vi.fn();
const defaultGetPendingHandoffIntentMock = vi.fn();
const defaultRemovePendingHandoffIntentMock = vi.fn();
const defaultPersistHandoffArtifactsForOrderMock = vi.fn();
const defaultRecoverHandoffKeysMock = vi.fn();
const defaultSchedulePurgeMock = vi.fn();
const defaultSweepDuePurgesMock = vi.fn();
const walletClientMock = { signMessage: vi.fn() };

vi.mock("wagmi", () => ({
    usePublicClient: () => usePublicClientMock(),
    useChainId: () => useChainIdMock(),
    useAccount: () => useAccountMock(),
    useWalletClient: () => useWalletClientMock(),
}));

vi.mock("@/lib/protocol/sellerRegistryIndexer", () => ({
    getSellerMetadataURI: (...args: unknown[]) => getSellerMetadataURIMock(...args),
}));

// The surfacing rule's AssemblyRegistry cross-check gate — resolved (empty)
// so useRegisteredCatalogues proceeds; the filtering itself lives in the
// (injected) discovery service.
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/seller/catalogueService", () => ({
    DEFAULT_CATALOGUE_SERVICE: {
        fetchSellerCatalogue: (...args: unknown[]) => defaultFetchSellerCatalogueMock(...args),
    },
}));

vi.mock("@/lib/seller/discoveryService", () => ({
    DEFAULT_DISCOVERY_SERVICE: {
        listFallbackRestaurants: (...args: unknown[]) => defaultListFallbackRestaurantsMock(...args),
        isRegistryConfigured: (...args: unknown[]) => defaultIsRegistryConfiguredMock(...args),
        listRestaurants: (...args: unknown[]) => defaultListRestaurantsMock(...args),
    },
}));

vi.mock("@/lib/shared/ipfsService", () => ({
    DEFAULT_IPFS_SERVICE: {
        pinJSON: (...args: unknown[]) => defaultIpfsPinJSONMock(...args),
        buildPath: (...args: unknown[]) => defaultIpfsBuildPathMock(...args),
        uploadFile: vi.fn(),
        buildURI: vi.fn(),
        resolveFetchUrl: vi.fn(),
        buildGatewayUrl: vi.fn(),
    },
}));

vi.mock("@/lib/handoff/coordinationMessagingService", () => ({
    DEFAULT_COORDINATION_MESSAGING_SERVICE: {
        sendHandoffKey: (...args: unknown[]) => defaultSendHandoffKeyMock(...args),
        subscribeHandoffKey: (...args: unknown[]) => defaultSubscribeHandoffKeyMock(...args),
        subscribeEcdhPubkey: (...args: unknown[]) => defaultSubscribeEcdhPubkeyMock(...args),
        sendWrappedKey: (...args: unknown[]) => defaultSendWrappedKeyMock(...args),
        sendEcdhPubkey: (...args: unknown[]) => defaultSendEcdhPubkeyMock(...args),
        subscribeWrappedKey: (...args: unknown[]) => defaultSubscribeWrappedKeyMock(...args),
    },
}));

vi.mock("@/lib/handoff/handoffPersistenceService", () => ({
    HANDOFF_KEY_STORAGE_KEY: "figaro-handoff-keys",
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE: {
        saveHandoffKey: (...args: unknown[]) => defaultSaveHandoffKeyMock(...args),
        getHandoffKey: (...args: unknown[]) => defaultGetHandoffKeyMock(...args),
        removeHandoffKey: (...args: unknown[]) => defaultRemoveHandoffKeyMock(...args),
        savePendingHandoffIntent: (...args: unknown[]) => defaultSavePendingHandoffIntentMock(...args),
        getPendingHandoffIntent: (...args: unknown[]) => defaultGetPendingHandoffIntentMock(...args),
        removePendingHandoffIntent: (...args: unknown[]) => defaultRemovePendingHandoffIntentMock(...args),
        persistHandoffArtifactsForOrder: (...args: unknown[]) => defaultPersistHandoffArtifactsForOrderMock(...args),
        recoverHandoffKeys: (...args: unknown[]) => defaultRecoverHandoffKeysMock(...args),
        schedulePurge: (...args: unknown[]) => defaultSchedulePurgeMock(...args),
        sweepDuePurges: (...args: unknown[]) => defaultSweepDuePurgesMock(...args),
        purgeHandoffArtifacts: vi.fn(),
    },
}));

vi.mock("@/lib/shared/e2e", () => ({
    isE2EMockSession: () => false,
}));

const publicClient = {
    transport: { type: "http" },
    getBlockNumber: (...args: unknown[]) => getBlockNumberMock(...args),
    watchContractEvent: (...args: unknown[]) => watchContractEventMock(...args),
};
const fallbackRestaurant: SellerCatalogue = {
    id: "fallback-1",
    name: "Fallback Merchant",
    description: "Fallback catalogue",
    specialty: "Test",
    image: "🍽️",
    address: "0x0000000000000000000000000000000000000001",
    items: [],
    acceptedTokens: [],
};

const injectedRestaurant: SellerCatalogue = {
    id: "merchant-1",
    name: "Injected Merchant",
    description: "Injected discovery result",
    specialty: "Italian",
    image: "🍕",
    address: "0x0000000000000000000000000000000000000011",
    items: [],
    acceptedTokens: [],
};

function createRuntimeServices(overrides: Partial<RuntimeServices> = {}): RuntimeServices {
    return {
        catalogue: {} as RuntimeServices["catalogue"],
        discovery: {} as RuntimeServices["discovery"],
        evidenceTransport: {
            pinJSON: vi.fn(),
            buildPath: vi.fn(),
            uploadFile: vi.fn(),
            buildURI: vi.fn(),
            resolveFetchUrl: vi.fn(),
            buildGatewayUrl: vi.fn(),
        } as unknown as RuntimeServices["evidenceTransport"],
        coordinationMessaging: {} as RuntimeServices["coordinationMessaging"],
        handoffPersistence: {} as RuntimeServices["handoffPersistence"],
        tokenConversion: {} as RuntimeServices["tokenConversion"],
        ...overrides,
    };
}

function createWrapper(services: RuntimeServices) {
    return ({ children }: { children: ReactNode }) => (
        <RuntimeServicesProvider services={services}>{children}</RuntimeServicesProvider>
    );
}

describe("runtime service hook injection", () => {
    beforeEach(() => {
        usePublicClientMock.mockReset();
        useChainIdMock.mockReset();
        useAccountMock.mockReset();
        useWalletClientMock.mockReset();
        getSellerMetadataURIMock.mockReset();
        getBlockNumberMock.mockReset();
        watchContractEventMock.mockReset();
        defaultFetchSellerCatalogueMock.mockReset();
        defaultListFallbackRestaurantsMock.mockReset();
        defaultIsRegistryConfiguredMock.mockReset();
        defaultListRestaurantsMock.mockReset();
        defaultIpfsPinJSONMock.mockReset();
        defaultIpfsBuildPathMock.mockReset();
        defaultSendHandoffKeyMock.mockReset();
        defaultSubscribeHandoffKeyMock.mockReset();
        defaultSubscribeEcdhPubkeyMock.mockReset();
        defaultSendWrappedKeyMock.mockReset();
        defaultSendEcdhPubkeyMock.mockReset();
        defaultSubscribeWrappedKeyMock.mockReset();
        defaultSaveHandoffKeyMock.mockReset();
        defaultGetHandoffKeyMock.mockReset();
        defaultRemoveHandoffKeyMock.mockReset();
        defaultSavePendingHandoffIntentMock.mockReset();
        defaultGetPendingHandoffIntentMock.mockReset();
        defaultRemovePendingHandoffIntentMock.mockReset();
        defaultPersistHandoffArtifactsForOrderMock.mockReset();
        defaultRecoverHandoffKeysMock.mockReset();
        defaultSchedulePurgeMock.mockReset();
        defaultSweepDuePurgesMock.mockReset();
        walletClientMock.signMessage.mockReset();

        usePublicClientMock.mockReturnValue(publicClient);
        useChainIdMock.mockReturnValue(31337);
        useAccountMock.mockReturnValue({ address: "0x1234567890123456789012345678901234567890" });
        useWalletClientMock.mockReturnValue({ data: walletClientMock });
        getBlockNumberMock.mockResolvedValue(100n);
        watchContractEventMock.mockReturnValue(() => undefined);
        defaultListFallbackRestaurantsMock.mockReturnValue({
            restaurants: [fallbackRestaurant],
            source: { ipfs: 0, mock: 1 },
        });
        defaultIsRegistryConfiguredMock.mockReturnValue(false);
    });

    it("uses an injected discovery service instead of the default provider", async () => {
        const listFallbackCatalogues = vi.fn().mockReturnValue({
            catalogues: [fallbackRestaurant],
            source: { ipfs: 0, mock: 1 },
        });
        const isRegistryConfigured = vi.fn().mockReturnValue(true);
        const listCatalogues = vi.fn().mockResolvedValue({
            catalogues: [injectedRestaurant],
            source: { ipfs: 1, mock: 0 },
        });
        const service = {
            listFallbackCatalogues,
            isRegistryConfigured,
            listCatalogues,
        } as unknown as DiscoveryService;

        const { result } = renderHook(() => useRegisteredCatalogues({ service }));

        await waitFor(() => {
            expect(result.current.catalogues).toEqual([injectedRestaurant]);
        });

        expect(listCatalogues).toHaveBeenCalledWith(publicClient, 31337, new Set());
        expect(defaultListRestaurantsMock).not.toHaveBeenCalled();
    });

    it("provides injected runtime services through context for evidence transport consumers", () => {
        const evidenceTransport = {
            pinJSON: vi.fn(),
            buildPath: vi.fn(),
            uploadFile: vi.fn(),
            buildURI: vi.fn(),
            resolveFetchUrl: vi.fn(),
            buildGatewayUrl: vi.fn(),
        } as unknown as IpfsService;
        const services = {
            catalogue: {} as RuntimeServices["catalogue"],
            discovery: {} as RuntimeServices["discovery"],
            evidenceTransport,
            coordinationMessaging: {} as RuntimeServices["coordinationMessaging"],
            handoffPersistence: {} as RuntimeServices["handoffPersistence"],
            tokenConversion: {} as RuntimeServices["tokenConversion"],
        } satisfies RuntimeServices;

        const wrapper = createWrapper(services);

        const { result } = renderHook(() => useRuntimeServices(), { wrapper });

        expect(result.current.evidenceTransport).toBe(evidenceTransport);
    });

    it("uses injected handoff persistence from runtime context in useHandoffCleanup", async () => {
        const sweepDuePurges = vi.fn();
        const schedulePurge = vi.fn();
        const services = createRuntimeServices({
            handoffPersistence: {
                sweepDuePurges,
                schedulePurge,
            } as unknown as RuntimeServices["handoffPersistence"],
        });
        const wrapper = createWrapper(services);

        renderHook(() => useHandoffCleanup(), { wrapper });

        await waitFor(() => {
            expect(sweepDuePurges).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890");
        });

        await waitFor(() => {
            expect(watchContractEventMock).toHaveBeenCalledTimes(2);
        });

        expect(defaultSweepDuePurgesMock).not.toHaveBeenCalled();
        expect(defaultSchedulePurgeMock).not.toHaveBeenCalled();
        expect(schedulePurge).not.toHaveBeenCalled();
    });
});
