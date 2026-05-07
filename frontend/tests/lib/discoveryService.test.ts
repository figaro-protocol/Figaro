import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDiscoveryService,
} from '@/lib/shared/discoveryService';

const getActiveOperatorsMock = vi.fn();
const fetchDocumentMock = vi.fn();

vi.mock('@/lib/core/indexer', () => ({
    getActiveOperators: (...args: unknown[]) => getActiveOperatorsMock(...args),
}));

vi.mock('@/lib/mechanisms/contracts', () => ({
    MECHANISM_CONTRACTS: {
        operatorRegistry: '0x1111111111111111111111111111111111111111',
    },
}));

function makeJsonResponse(body: unknown): Response {
    return {
        ok: true,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

describe('discoveryService', () => {
    let discoveryService: ReturnType<typeof createDiscoveryService>;

    beforeEach(() => {
        getActiveOperatorsMock.mockReset();
        fetchDocumentMock.mockReset();
        discoveryService = createDiscoveryService({ fetchDocument: fetchDocumentMock });
    });

    it('returns fallback restaurants when the registry has no merchants', async () => {
        getActiveOperatorsMock.mockResolvedValueOnce([]);

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBeGreaterThan(0);
        expect(result.restaurants.length).toBe(result.source.mock);
    });

    it('maps a SellerCatalogueMetadata document into a discovery restaurant', async () => {
        getActiveOperatorsMock.mockResolvedValueOnce([
            {
                address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
                role: 1,
                metadataURI: 'ipfs://merchant-a',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            merchantId: 'merchant-a',
            slug: 'merchant-a',
            name: 'Merchant A',
            description: 'Test merchant',
            cuisine: 'Italian',
            fulfillmentModes: ['delivery'],
            location: { geohash: 'dr5reg' },
            minimumOrder: '0.01',
            estimatedFulfillment: '15-25 min',
            menu: [
                {
                    id: 'pizza',
                    name: 'Pizza',
                    description: 'Slice',
                    price: '0.01',
                    category: 'Pizza',
                    available: true,
                },
            ],
            acceptedTokens: [{ address: '0x1', symbol: 'FIG' }],
            version: '1.0.0',
        }));

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(1);
        expect(result.restaurants[0]).toEqual(expect.objectContaining({
            id: 'merchant-a',
            name: 'Merchant A',
            cuisine: 'Italian',
            deliveryTime: '15-25 min',
        }));
        expect(result.restaurants.some((r) => r.name === "Bob's Pizza Palace")).toBe(false);
        expect(result.source.mock).toBeGreaterThan(0);
    });

    it('maps an operator profile document into a discovery restaurant and follows catalogueURI', async () => {
        getActiveOperatorsMock.mockResolvedValueOnce([
            {
                address: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd',
                role: 1,
                metadataURI: 'ipfs://op-profile',
            },
        ]);
        // First fetch: operator profile
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            name: 'Street Tacos',
            description: 'Local taco stand',
            serviceTypes: ['pickup'],
            acceptedTokens: ['0xABC123'],
            catalogueURI: 'ipfs://op-catalogue',
        }));
        // Second fetch: catalogue document
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            version: '1',
            items: [
                { id: 'taco-1', name: 'Al Pastor', price: '0.05', category: 'Tacos', available: true },
            ],
        }));

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(1);
        expect(result.restaurants[0]).toEqual(expect.objectContaining({
            name: 'Street Tacos',
            fulfillmentModes: ['pickup'],
        }));
        expect(result.restaurants[0].menu).toHaveLength(1);
        expect(result.restaurants[0].menu[0].name).toBe('Al Pastor');
    });

    it('maps an operator profile without a catalogueURI into a restaurant with an empty menu', async () => {
        getActiveOperatorsMock.mockResolvedValueOnce([
            {
                address: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd',
                role: 1,
                metadataURI: 'ipfs://op-profile-no-cat',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            name: 'Ghost Kitchen',
            serviceTypes: ['delivery'],
        }));

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(1);
        expect(result.restaurants[0].name).toBe('Ghost Kitchen');
        expect(result.restaurants[0].menu).toHaveLength(0);
        expect(fetchDocumentMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to mocks when operator lookup fails', async () => {
        getActiveOperatorsMock.mockRejectedValueOnce(new Error('indexer offline'));

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBeGreaterThan(0);
    });

    it('excludes operators whose documents cannot be fetched and uses mock fallback', async () => {
        getActiveOperatorsMock.mockResolvedValueOnce([
            {
                address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
                role: 1,
                metadataURI: 'ipfs://bad',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce({ ok: false } as Response);

        const result = await discoveryService.listRestaurants({} as never, 31337);

        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBeGreaterThan(0);
    });
});
