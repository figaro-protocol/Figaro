import type { CatalogueService } from "@/lib/shared/catalogueService";
import { DEFAULT_CATALOGUE_SERVICE } from "@/lib/shared/catalogueService";
import type { CoordinationMessagingService } from "@/lib/shared/coordinationMessagingService";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import type { DiscoveryService } from "@/lib/shared/discoveryService";
import { DEFAULT_DISCOVERY_SERVICE } from "@/lib/shared/discoveryService";
import type { HandoffPersistenceService } from "@/lib/shared/handoffPersistenceService";
import { DEFAULT_HANDOFF_PERSISTENCE_SERVICE } from "@/lib/shared/handoffPersistenceService";
import type { IpfsService } from "@/lib/shared/ipfsService";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import type { TokenConversionService } from "@/lib/shared/tokenConversion";
import { DEFAULT_TOKEN_CONVERSION_SERVICE } from "@/lib/shared/tokenConversion";

/** The 6 service slots a runtime carries. */
type RuntimeServiceKey =
    | "catalogue"
    | "discovery"
    | "evidenceTransport"
    | "coordinationMessaging"
    | "handoffPersistence"
    | "tokenConversion";

export interface RuntimeServices {
    catalogue: CatalogueService;
    discovery: DiscoveryService;
    evidenceTransport: IpfsService;
    coordinationMessaging: CoordinationMessagingService;
    handoffPersistence: HandoffPersistenceService;
    tokenConversion: TokenConversionService;
}

type RuntimeServiceProviderKeys = Record<RuntimeServiceKey, string>;

const DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS: Record<RuntimeServiceKey, string> = {
    catalogue: "default-catalogue",
    discovery: "default-discovery",
    evidenceTransport: "default-ipfs",
    coordinationMessaging: "default-coordination-messaging",
    handoffPersistence: "default-handoff-persistence",
    tokenConversion: "default-token-conversion",
};

export const DEFAULT_RUNTIME_SERVICES: RuntimeServices = {
    catalogue: DEFAULT_CATALOGUE_SERVICE,
    discovery: DEFAULT_DISCOVERY_SERVICE,
    evidenceTransport: DEFAULT_IPFS_SERVICE,
    coordinationMessaging: DEFAULT_COORDINATION_MESSAGING_SERVICE,
    handoffPersistence: DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    tokenConversion: DEFAULT_TOKEN_CONVERSION_SERVICE,
};

type RuntimeServiceProviderRegistry = {
    [K in RuntimeServiceKey]: Map<string, RuntimeServices[K]>;
};

function createRuntimeServiceProviderRegistry(): RuntimeServiceProviderRegistry {
    return {
        catalogue: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.catalogue, DEFAULT_RUNTIME_SERVICES.catalogue]]),
        discovery: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.discovery, DEFAULT_RUNTIME_SERVICES.discovery]]),
        evidenceTransport: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.evidenceTransport, DEFAULT_RUNTIME_SERVICES.evidenceTransport]]),
        coordinationMessaging: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.coordinationMessaging, DEFAULT_RUNTIME_SERVICES.coordinationMessaging]]),
        handoffPersistence: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.handoffPersistence, DEFAULT_RUNTIME_SERVICES.handoffPersistence]]),
        tokenConversion: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.tokenConversion, DEFAULT_RUNTIME_SERVICES.tokenConversion]]),
    };
}

const runtimeServiceProviderRegistry = createRuntimeServiceProviderRegistry();

function registerRuntimeServiceProvider<K extends RuntimeServiceKey>(
    serviceKey: K,
    providerKey: string,
    service: RuntimeServices[K],
): void {
    runtimeServiceProviderRegistry[serviceKey].set(providerKey, service);
}
