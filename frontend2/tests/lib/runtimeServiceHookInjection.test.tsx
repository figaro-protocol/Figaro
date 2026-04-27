import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";
import {
    persistHandoffArtifactsForOrder,
    recoverHandoffKeys,
} from "@/lib/handoff/handoffArtifacts";
import {
    getHandoffKey,
    removeHandoffKey,
    saveHandoffKey,
} from "@/lib/handoff/handoffKeys";
import {
    getPendingHandoffIntent,
    removePendingHandoffIntent,
    savePendingHandoffIntent,
} from "@/lib/handoff/handoffIntent";
import { useMerchantCatalogue } from "@/lib/mechanisms/useMerchantCatalogue";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { useRuntimeIdentitySource } from "@/hooks/core/useRuntimeIdentitySource";
import {
    RuntimeServicesProvider,
    useRuntimeServices,
} from "@/lib/shared/runtimeServicesContext";
import type { Restaurant } from "@/lib/marketplace/types";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { CatalogueService } from "@/lib/shared/catalogueService";
import type { DiscoveryService } from "@/lib/shared/discoveryService";
import type { IpfsService } from "@/lib/shared/ipfsService";
import type { RuntimeIdentityService } from "@/lib/shared/runtimeIdentityService";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";

const usePublicClientMock = vi.fn();
const useChainIdMock = vi.fn();
const useAccountMock = vi.fn();
const useWalletClientMock = vi.fn();
const getOperatorMetadataURIMock = vi.fn();
const getBlockNumberMock = vi.fn();
const watchContractEventMock = vi.fn();
const defaultFetchMerchantCatalogueMock = vi.fn();
const defaultListFallbackRestaurantsMock = vi.fn();
const defaultIsRegistryConfiguredMock = vi.fn();
const defaultListRestaurantsMock = vi.fn();
const defaultGetFallbackSourceMock = vi.fn();
const defaultLoadSourceFromUrlMock = vi.fn();
const defaultResolveAssemblyContextMock = vi.fn();
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

vi.mock("@/lib/core/indexer", () => ({
    getOperatorMetadataURI: (...args: unknown[]) => getOperatorMetadataURIMock(...args),
}));

vi.mock("@/lib/shared/catalogueService", () => ({
    DEFAULT_CATALOGUE_SERVICE: {
        fetchMerchantCatalogue: (...args: unknown[]) => defaultFetchMerchantCatalogueMock(...args),
    },
}));

vi.mock("@/lib/shared/discoveryService", () => ({
    DEFAULT_DISCOVERY_SERVICE: {
        listFallbackRestaurants: (...args: unknown[]) => defaultListFallbackRestaurantsMock(...args),
        isRegistryConfigured: (...args: unknown[]) => defaultIsRegistryConfiguredMock(...args),
        listRestaurants: (...args: unknown[]) => defaultListRestaurantsMock(...args),
    },
}));

vi.mock("@/lib/shared/runtimeIdentityService", () => ({
    DEFAULT_RUNTIME_IDENTITY_SERVICE: {
        getFallbackSource: (...args: unknown[]) => defaultGetFallbackSourceMock(...args),
        loadSourceFromUrl: (...args: unknown[]) => defaultLoadSourceFromUrlMock(...args),
        resolveAssemblyContext: (...args: unknown[]) => defaultResolveAssemblyContextMock(...args),
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

vi.mock("@/lib/shared/coordinationMessagingService", () => ({
    DEFAULT_COORDINATION_MESSAGING_SERVICE: {
        sendHandoffKey: (...args: unknown[]) => defaultSendHandoffKeyMock(...args),
        subscribeHandoffKey: (...args: unknown[]) => defaultSubscribeHandoffKeyMock(...args),
        subscribeEcdhPubkey: (...args: unknown[]) => defaultSubscribeEcdhPubkeyMock(...args),
        sendWrappedKey: (...args: unknown[]) => defaultSendWrappedKeyMock(...args),
        sendEcdhPubkey: (...args: unknown[]) => defaultSendEcdhPubkeyMock(...args),
        subscribeWrappedKey: (...args: unknown[]) => defaultSubscribeWrappedKeyMock(...args),
    },
}));

vi.mock("@/lib/shared/handoffPersistenceService", () => ({
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
const fallbackRestaurant: Restaurant = {
    id: "fallback-1",
    name: "Fallback Merchant",
    description: "Fallback catalogue",
    cuisine: "Test",
    deliveryTime: "20 min",
    minimumOrder: "0.01",
    image: "🍽️",
    address: "0x0000000000000000000000000000000000000001",
    menu: [],
    acceptedTokens: [],
    fulfillmentModes: ["delivery"],
    rating: 4.5,
};

const injectedRestaurant: Restaurant = {
    id: "merchant-1",
    name: "Injected Merchant",
    description: "Injected discovery result",
    cuisine: "Italian",
    deliveryTime: "15-20 min",
    minimumOrder: "0.02",
    image: "🍕",
    address: "0x0000000000000000000000000000000000000011",
    menu: [],
    acceptedTokens: [],
    fulfillmentModes: ["delivery"],
    rating: 4.5,
};

function createRuntimeServices(overrides: Partial<RuntimeServices> = {}): RuntimeServices {
    return {
        identity: {} as RuntimeServices["identity"],
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
        getOperatorMetadataURIMock.mockReset();
        getBlockNumberMock.mockReset();
        watchContractEventMock.mockReset();
        defaultFetchMerchantCatalogueMock.mockReset();
        defaultListFallbackRestaurantsMock.mockReset();
        defaultIsRegistryConfiguredMock.mockReset();
        defaultListRestaurantsMock.mockReset();
        defaultGetFallbackSourceMock.mockReset();
        defaultLoadSourceFromUrlMock.mockReset();
        defaultResolveAssemblyContextMock.mockReset();
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
        defaultGetFallbackSourceMock.mockReturnValue({ sourceLabel: "default" });
    });

    it("uses an injected catalogue service instead of the default provider", async () => {
        getOperatorMetadataURIMock.mockResolvedValueOnce("ipfs://merchant-a");

        const catalogue: SellerCatalogueMetadata = {
            subjectAddress: "0x0000000000000000000000000000000000000011",
            archetypeId: "merchant-one-hop-delivery",
            merchantId: "merchant-a",
            slug: "merchant-a",
            name: "Merchant A",
            description: "Injected catalogue",
            cuisine: "Italian",
            fulfillmentModes: ["delivery"],
            location: { geohash: "dr5reg" },
            minimumOrder: "0.01",
            estimatedFulfillment: "15-25 min",
            menu: [],
            acceptedTokens: [],
            version: "1.0.0",
        };
        const fetchMerchantCatalogue = vi.fn().mockResolvedValue(catalogue);
        const service = {
            fetchMerchantCatalogue,
        } as unknown as CatalogueService;

        const { result } = renderHook(() => useMerchantCatalogue(
            "0x0000000000000000000000000000000000000011",
            { service },
        ));

        await waitFor(() => {
            expect(result.current.catalogue).toEqual(catalogue);
        });

        expect(fetchMerchantCatalogue).toHaveBeenCalledWith("ipfs://merchant-a");
        expect(defaultFetchMerchantCatalogueMock).not.toHaveBeenCalled();
    });

    it("uses an injected discovery service instead of the default provider", async () => {
        const listFallbackRestaurants = vi.fn().mockReturnValue({
            restaurants: [fallbackRestaurant],
            source: { ipfs: 0, mock: 1 },
        });
        const isRegistryConfigured = vi.fn().mockReturnValue(true);
        const listRestaurants = vi.fn().mockResolvedValue({
            restaurants: [injectedRestaurant],
            source: { ipfs: 1, mock: 0 },
        });
        const service = {
            listFallbackRestaurants,
            isRegistryConfigured,
            listRestaurants,
        } as unknown as DiscoveryService;

        const { result } = renderHook(() => useRegisteredCatalogues({ service }));

        await waitFor(() => {
            expect(result.current.restaurants).toEqual([injectedRestaurant]);
        });

        expect(listRestaurants).toHaveBeenCalledWith(publicClient, 31337);
        expect(defaultListRestaurantsMock).not.toHaveBeenCalled();
    });

    it("uses an injected runtime identity service for both fallback source and context resolution", () => {
        const fallbackSource = { sourceLabel: "injected" };
        const resolveAssemblyContext = vi.fn().mockReturnValue({ assemblySlug: "local-commerce" });
        const service = {
            getFallbackSource: vi.fn().mockReturnValue(fallbackSource),
            loadSourceFromUrl: vi.fn(),
            resolveAssemblyContext,
        } as unknown as RuntimeIdentityService;

        const { result } = renderHook(() => useRuntimeIdentitySource({ service }));

        expect(result.current.activeRuntimeSource).toBe(fallbackSource);
        expect(result.current.resolveAssemblyContext("local-commerce", "local-anvil")).toEqual({ assemblySlug: "local-commerce" });
        expect(resolveAssemblyContext).toHaveBeenCalledWith("local-commerce", "local-anvil", fallbackSource);
        expect(defaultGetFallbackSourceMock).not.toHaveBeenCalled();
        expect(defaultResolveAssemblyContextMock).not.toHaveBeenCalled();
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
            identity: {} as RuntimeServices["identity"],
            catalogue: {} as RuntimeServices["catalogue"],
            discovery: {} as RuntimeServices["discovery"],
            evidenceTransport,
            coordinationMessaging: {} as RuntimeServices["coordinationMessaging"],
            handoffPersistence: {} as RuntimeServices["handoffPersistence"],
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

    it("uses an injected handoff persistence service in handoff helper wrappers", async () => {
        const persist = vi.fn().mockResolvedValue({
            processId: "process-1",
            orderId: "order-1",
            txHash: "0xabc",
        });
        const recover = vi.fn().mockResolvedValue(2);
        const saveKey = vi.fn();
        const getKey = vi.fn().mockReturnValue({ keyB64: "key-123" });
        const removeKeyForOrder = vi.fn();
        const saveIntent = vi.fn();
        const getIntent = vi.fn().mockReturnValue({ processId: "process-1", originOrderId: "order-1" });
        const removeIntent = vi.fn();
        const service = {
            persistHandoffArtifactsForOrder: persist,
            recoverHandoffKeys: recover,
            saveHandoffKey: saveKey,
            getHandoffKey: getKey,
            removeHandoffKey: removeKeyForOrder,
            savePendingHandoffIntent: saveIntent,
            getPendingHandoffIntent: getIntent,
            removePendingHandoffIntent: removeIntent,
        } as unknown as RuntimeServices["handoffPersistence"];
        const persistParams = {
            publicClient: publicClient as never,
            buyerAddress: "0x1234567890123456789012345678901234567890",
            orderTxHash: "0xabc" as `0x${string}`,
            keyB64: "key-123",
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5rs3",
            maxFulfillerPrice: "1",
        };
        const keyRecord = {
            keyB64: "key-123",
            txHash: "0xabc",
            processId: "process-1",
            orderId: "order-1",
            createdAt: 1,
        };
        const intentRecord = {
            processId: "process-1",
            originOrderId: "order-1",
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5rs3",
            maxFulfillerPrice: "1",
            createdAt: 1,
        };
        const orders = [{ processId: "process-1", orderId: "order-1", manifest: "ipfs://manifest" }];

        await expect(persistHandoffArtifactsForOrder(persistParams, { service })).resolves.toEqual({
            processId: "process-1",
            orderId: "order-1",
            txHash: "0xabc",
        });
        await expect(recoverHandoffKeys(walletClientMock, "0x1234567890123456789012345678901234567890", orders, { service })).resolves.toBe(2);

        saveHandoffKey("0x1234567890123456789012345678901234567890", keyRecord, { service });
        expect(getHandoffKey("0x1234567890123456789012345678901234567890", "process-1", "order-1", { service })).toEqual({ keyB64: "key-123" });
        removeHandoffKey("0x1234567890123456789012345678901234567890", "process-1", "order-1", { service });

        savePendingHandoffIntent("0x1234567890123456789012345678901234567890", intentRecord, { service });
        expect(getPendingHandoffIntent("0x1234567890123456789012345678901234567890", "process-1", "order-1", { service })).toEqual({
            processId: "process-1",
            originOrderId: "order-1",
        });
        removePendingHandoffIntent("0x1234567890123456789012345678901234567890", "process-1", "order-1", { service });

        expect(persist).toHaveBeenCalledWith(persistParams);
        expect(recover).toHaveBeenCalledWith(walletClientMock, "0x1234567890123456789012345678901234567890", orders);
        expect(saveKey).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", keyRecord);
        expect(getKey).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", "process-1", "order-1");
        expect(removeKeyForOrder).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", "process-1", "order-1");
        expect(saveIntent).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", intentRecord);
        expect(getIntent).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", "process-1", "order-1");
        expect(removeIntent).toHaveBeenCalledWith("0x1234567890123456789012345678901234567890", "process-1", "order-1");
        expect(defaultPersistHandoffArtifactsForOrderMock).not.toHaveBeenCalled();
        expect(defaultRecoverHandoffKeysMock).not.toHaveBeenCalled();
        expect(defaultSaveHandoffKeyMock).not.toHaveBeenCalled();
        expect(defaultGetHandoffKeyMock).not.toHaveBeenCalled();
        expect(defaultRemoveHandoffKeyMock).not.toHaveBeenCalled();
        expect(defaultSavePendingHandoffIntentMock).not.toHaveBeenCalled();
        expect(defaultGetPendingHandoffIntentMock).not.toHaveBeenCalled();
        expect(defaultRemovePendingHandoffIntentMock).not.toHaveBeenCalled();
    });
});
