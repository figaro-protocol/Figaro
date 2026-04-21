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
import type { InstitutionAssembly, RuntimeServiceKey, ServiceBinding } from "@/lib/shared/institutionAssembly";
import type { AssemblyBoundSubjectSummary } from "@/lib/shared/runtimeDataSource";
import type { RuntimeIdentityService } from "@/lib/shared/runtimeIdentityService";
import { DEFAULT_RUNTIME_IDENTITY_SERVICE } from "@/lib/shared/runtimeIdentityService";

export interface RuntimeServices {
    identity: RuntimeIdentityService;
    catalogue: CatalogueService;
    discovery: DiscoveryService;
    evidenceTransport: IpfsService;
    coordinationMessaging: CoordinationMessagingService;
    handoffPersistence: HandoffPersistenceService;
}

export type RuntimeServiceProviderKeys = Record<RuntimeServiceKey, string>;

export const DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS: Record<RuntimeServiceKey, string> = {
    identity: "default-runtime-identity",
    catalogue: "default-catalogue",
    discovery: "default-discovery",
    evidenceTransport: "default-ipfs",
    coordinationMessaging: "default-coordination-messaging",
    handoffPersistence: "default-handoff-persistence",
};

export const DEFAULT_RUNTIME_SERVICES: RuntimeServices = {
    identity: DEFAULT_RUNTIME_IDENTITY_SERVICE,
    catalogue: DEFAULT_CATALOGUE_SERVICE,
    discovery: DEFAULT_DISCOVERY_SERVICE,
    evidenceTransport: DEFAULT_IPFS_SERVICE,
    coordinationMessaging: DEFAULT_COORDINATION_MESSAGING_SERVICE,
    handoffPersistence: DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
};

type RuntimeServiceBindingSource = Pick<AssemblyBoundSubjectSummary, "bindingId" | "serviceBindings">;

type RuntimeServiceProviderRegistry = {
    [K in RuntimeServiceKey]: Map<string, RuntimeServices[K]>;
};

function createRuntimeServiceProviderRegistry(): RuntimeServiceProviderRegistry {
    return {
        identity: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.identity, DEFAULT_RUNTIME_SERVICES.identity]]),
        catalogue: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.catalogue, DEFAULT_RUNTIME_SERVICES.catalogue]]),
        discovery: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.discovery, DEFAULT_RUNTIME_SERVICES.discovery]]),
        evidenceTransport: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.evidenceTransport, DEFAULT_RUNTIME_SERVICES.evidenceTransport]]),
        coordinationMessaging: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.coordinationMessaging, DEFAULT_RUNTIME_SERVICES.coordinationMessaging]]),
        handoffPersistence: new Map([[DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.handoffPersistence, DEFAULT_RUNTIME_SERVICES.handoffPersistence]]),
    };
}

const runtimeServiceProviderRegistry = createRuntimeServiceProviderRegistry();

export function registerRuntimeServiceProvider<K extends RuntimeServiceKey>(
    serviceKey: K,
    providerKey: string,
    service: RuntimeServices[K],
): void {
    runtimeServiceProviderRegistry[serviceKey].set(providerKey, service);
}

function resolveProviderKey(
    assembly: InstitutionAssembly,
    serviceKey: RuntimeServiceKey,
    bindingSource?: RuntimeServiceBindingSource,
): string {
    return findProviderKey(bindingSource?.serviceBindings, serviceKey)
        ?? findProviderKey(assembly.serviceBindings, serviceKey)
        ?? DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS[serviceKey];
}

function findProviderKey(
    bindings: ServiceBinding[] | undefined,
    serviceKey: RuntimeServiceKey,
): string | undefined {
    return bindings?.find((binding) => binding.serviceKey === serviceKey)?.providerKey;
}

function resolveService<K extends RuntimeServiceKey>(
    assembly: InstitutionAssembly,
    serviceKey: K,
    bindingSource?: RuntimeServiceBindingSource,
): RuntimeServices[K] {
    const providerKey = resolveProviderKey(assembly, serviceKey, bindingSource);
    const registeredService = runtimeServiceProviderRegistry[serviceKey].get(providerKey);
    if (registeredService) {
        return registeredService;
    }

    if (providerKey !== DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS[serviceKey] && process.env.NODE_ENV === "development") {
        const bindingContext = bindingSource?.bindingId
            ? ` binding "${bindingSource.bindingId}"`
            : "";
        console.warn(
            `[runtimeServices] Unknown provider key "${providerKey}" for service "${serviceKey}" in assembly "${assembly.identity.slug}"${bindingContext}. Falling back to default provider.`,
        );
    }

    return DEFAULT_RUNTIME_SERVICES[serviceKey];
}

export function resolveRuntimeServices(
    assembly: InstitutionAssembly,
    bindingSource?: RuntimeServiceBindingSource,
): RuntimeServices {
    return {
        identity: resolveService(assembly, "identity", bindingSource),
        catalogue: resolveService(assembly, "catalogue", bindingSource),
        discovery: resolveService(assembly, "discovery", bindingSource),
        evidenceTransport: resolveService(assembly, "evidenceTransport", bindingSource),
        coordinationMessaging: resolveService(assembly, "coordinationMessaging", bindingSource),
        handoffPersistence: resolveService(assembly, "handoffPersistence", bindingSource),
    };
}

export function resolveRuntimeServiceProviderKeys(
    assembly: InstitutionAssembly,
    bindingSource?: RuntimeServiceBindingSource,
): RuntimeServiceProviderKeys {
    return {
        identity: resolveProviderKey(assembly, "identity", bindingSource),
        catalogue: resolveProviderKey(assembly, "catalogue", bindingSource),
        discovery: resolveProviderKey(assembly, "discovery", bindingSource),
        evidenceTransport: resolveProviderKey(assembly, "evidenceTransport", bindingSource),
        coordinationMessaging: resolveProviderKey(assembly, "coordinationMessaging", bindingSource),
        handoffPersistence: resolveProviderKey(assembly, "handoffPersistence", bindingSource),
    };
}