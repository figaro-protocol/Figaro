import { describe, expect, it, vi } from "vitest";
import localCommerceReference from "@/lib/shared/assemblies/local-commerce.reference.json";
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";
import { DEFAULT_CATALOGUE_SERVICE } from "@/lib/shared/catalogueService";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import { DEFAULT_HANDOFF_PERSISTENCE_SERVICE } from "@/lib/shared/handoffPersistenceService";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS,
    registerRuntimeServiceProvider,
    resolveRuntimeServiceProviderKeys,
    resolveRuntimeServices,
} from "@/lib/shared/runtimeServices";

describe("runtimeServices", () => {
    it("resolves default runtime services for assemblies with explicit binding keys", () => {
        const assembly = parseAssemblyDocument({
            ...localCommerceReference,
            serviceBindings: [
                { serviceKey: "catalogue", providerKey: "default-catalogue" },
                { serviceKey: "evidenceTransport", providerKey: "default-ipfs" },
                { serviceKey: "coordinationMessaging", providerKey: "default-coordination-messaging" },
                { serviceKey: "handoffPersistence", providerKey: "default-handoff-persistence" },
            ],
        }, "local-commerce.reference.json");

        const services = resolveRuntimeServices(assembly);

        expect(services.catalogue).toBe(DEFAULT_CATALOGUE_SERVICE);
        expect(services.evidenceTransport).toBe(DEFAULT_IPFS_SERVICE);
        expect(services.coordinationMessaging).toBe(DEFAULT_COORDINATION_MESSAGING_SERVICE);
        expect(services.handoffPersistence).toBe(DEFAULT_HANDOFF_PERSISTENCE_SERVICE);
    });

    it("falls back to default services when an assembly names an unknown provider key", () => {
        const assembly = parseAssemblyDocument({
            ...localCommerceReference,
            serviceBindings: [
                { serviceKey: "catalogue", providerKey: "custom-catalogue-provider" },
            ],
        }, "local-commerce.reference.json");

        const services = resolveRuntimeServices(assembly);

        expect(services.catalogue).toBe(DEFAULT_CATALOGUE_SERVICE);
    });

    it("resolves a registered custom provider when an assembly binds its provider key", () => {
        const providerKey = "test-custom-catalogue-provider";
        const customCatalogueService = {
            fetchMerchantCatalogue: vi.fn(),
            invalidateMerchantCatalogueCache: vi.fn(),
            publishMerchantCatalogue: vi.fn(),
            publishCourierOffering: vi.fn(),
        } as unknown as typeof DEFAULT_CATALOGUE_SERVICE;

        registerRuntimeServiceProvider("catalogue", providerKey, customCatalogueService);

        const assembly = parseAssemblyDocument({
            ...localCommerceReference,
            serviceBindings: [
                { serviceKey: "catalogue", providerKey },
            ],
        }, "local-commerce.reference.json");

        const services = resolveRuntimeServices(assembly);

        expect(services.catalogue).toBe(customCatalogueService);
    });

    it("prefers binding-level provider keys over assembly-level service bindings", () => {
        const assemblyProviderKey = "test-assembly-catalogue-provider";
        const bindingProviderKey = "test-binding-catalogue-provider";
        const assemblyCatalogueService = {
            fetchMerchantCatalogue: vi.fn(),
            invalidateMerchantCatalogueCache: vi.fn(),
            publishMerchantCatalogue: vi.fn(),
            publishCourierOffering: vi.fn(),
        } as unknown as typeof DEFAULT_CATALOGUE_SERVICE;
        const bindingCatalogueService = {
            fetchMerchantCatalogue: vi.fn(),
            invalidateMerchantCatalogueCache: vi.fn(),
            publishMerchantCatalogue: vi.fn(),
            publishCourierOffering: vi.fn(),
        } as unknown as typeof DEFAULT_CATALOGUE_SERVICE;

        registerRuntimeServiceProvider("catalogue", assemblyProviderKey, assemblyCatalogueService);
        registerRuntimeServiceProvider("catalogue", bindingProviderKey, bindingCatalogueService);

        const assembly = parseAssemblyDocument({
            ...localCommerceReference,
            serviceBindings: [
                { serviceKey: "catalogue", providerKey: assemblyProviderKey },
            ],
        }, "local-commerce.reference.json");

        const services = resolveRuntimeServices(assembly, {
            bindingId: "binding:test-merchant:local-anvil",
            serviceBindings: [
                {
                    serviceKey: "catalogue",
                    providerKey: bindingProviderKey,
                },
            ],
        });

        expect(services.catalogue).toBe(bindingCatalogueService);
    });

    it("exposes resolved provider keys for runtime snapshot consumers", () => {
        const assemblyProviderKey = "test-assembly-discovery-provider";
        const bindingProviderKey = "test-binding-catalogue-provider-keys";
        const assembly = parseAssemblyDocument({
            ...localCommerceReference,
            serviceBindings: [
                { serviceKey: "discovery", providerKey: assemblyProviderKey },
            ],
        }, "local-commerce.reference.json");

        const providerKeys = resolveRuntimeServiceProviderKeys(assembly, {
            bindingId: "binding:test-merchant:local-anvil",
            serviceBindings: [
                {
                    serviceKey: "catalogue",
                    providerKey: bindingProviderKey,
                },
            ],
        });

        expect(providerKeys.catalogue).toBe(bindingProviderKey);
        expect(providerKeys.discovery).toBe(assemblyProviderKey);
        expect(providerKeys.identity).toBe(DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.identity);
        expect(providerKeys.evidenceTransport).toBe(DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS.evidenceTransport);
    });
});