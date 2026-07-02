import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDiscoveryService,
} from '@/lib/seller/discoveryService';

const getActiveSellersMock = vi.fn();
const fetchDocumentMock = vi.fn();

vi.mock('@/lib/core/indexer', () => ({
    getActiveSellers: (...args: unknown[]) => getActiveSellersMock(...args),
}));

vi.mock('@/lib/core/contracts', () => ({
    CONTRACTS: {
        sellerRegistry: '0x1111111111111111111111111111111111111111',
    },
}));

function makeJsonResponse(body: unknown): Response {
    return {
        ok: true,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

// The AssemblyRegistry's anchored slugs the surfacing rule cross-checks
// against (applied evenly across every projection, operator 2026-07-02).
const ANCHORED = new Set(['asm-anchored']);

function anchoredBinding(subjectAddress: string) {
    return [{
        bindingId: 'binding-1',
        subjectAddress,
        assemblySlug: 'asm-anchored',
        counterpartyBindings: [],
    }];
}

describe('discoveryService', () => {
    let discoveryService: ReturnType<typeof createDiscoveryService>;

    beforeEach(() => {
        getActiveSellersMock.mockReset();
        fetchDocumentMock.mockReset();
        discoveryService = createDiscoveryService({ fetchDocument: fetchDocumentMock });
    });

    it('returns an empty result when the registry has no sellers', async () => {
        getActiveSellersMock.mockResolvedValueOnce([]);

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.catalogues).toHaveLength(0);
        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBe(0);
    });

    it('maps a SellerCatalogueMetadata document into a discovery restaurant', async () => {
        getActiveSellersMock.mockResolvedValueOnce([
            {
                address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
                role: 1,
                metadataURI: 'ipfs://merchant-a',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            name: 'Merchant A',
            description: 'Test merchant',
            specialty: 'Italian',
            location: { geohash: 'dr5reg' },
            items: [
                {
                    id: 'pizza',
                    name: 'Pizza',
                    description: 'Slice',
                    price: '0.01',
                    category: 'Pizza',
                    available: true,
                },
            ],
            acceptedTokens: [{ address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'FIG' }],
            assemblyBindings: anchoredBinding('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'),
            version: '1.0.0',
        }));

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.source.ipfs).toBe(1);
        expect(result.source.mock).toBe(0);
        expect(result.catalogues).toHaveLength(1);
        expect(result.catalogues[0]).toEqual(expect.objectContaining({
            id: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
            name: 'Merchant A',
            specialty: 'Italian',
        }));
    });

    it('maps an seller profile document into a discovery restaurant and follows catalogueURI', async () => {
        getActiveSellersMock.mockResolvedValueOnce([
            {
                address: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd',
                role: 1,
                metadataURI: 'ipfs://op-profile',
            },
        ]);
        // First fetch: seller profile
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            name: 'Street Tacos',
            description: 'Local taco stand',
            acceptedTokens: [
                { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
            ],
            assemblyBindings: anchoredBinding('0xaabbccddaabbccddaabbccddaabbccddaabbccdd'),
            catalogueURI: 'ipfs://op-catalogue',
        }));
        // Second fetch: catalogue document
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            version: '1',
            items: [
                { id: 'taco-1', name: 'Al Pastor', price: '0.05', category: 'Tacos', available: true },
            ],
        }));

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.source.ipfs).toBe(1);
        expect(result.catalogues[0]).toEqual(expect.objectContaining({
            name: 'Street Tacos',
        }));
        expect(result.catalogues[0].items).toHaveLength(1);
        expect(result.catalogues[0].items[0].name).toBe('Al Pastor');
    });

    it('maps an seller profile without a catalogueURI into a restaurant with an empty menu', async () => {
        getActiveSellersMock.mockResolvedValueOnce([
            {
                address: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd',
                role: 1,
                metadataURI: 'ipfs://op-profile-no-cat',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            name: 'Ghost Kitchen',
            assemblyBindings: anchoredBinding('0xaabbccddaabbccddaabbccddaabbccddaabbccdd'),
        }));

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.source.ipfs).toBe(1);
        expect(result.catalogues[0].name).toBe('Ghost Kitchen');
        expect(result.catalogues[0].items).toHaveLength(0);
        expect(fetchDocumentMock).toHaveBeenCalledTimes(1);
    });

    it('returns an empty result when the seller-event lookup fails', async () => {
        getActiveSellersMock.mockRejectedValueOnce(new Error('indexer offline'));

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.catalogues).toHaveLength(0);
        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBe(0);
    });

    it('excludes sellers without an anchored assembly binding (surfacing rule, applied evenly)', async () => {
        getActiveSellersMock.mockResolvedValueOnce([
            {
                address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
                role: 1,
                metadataURI: 'ipfs://unbound',
            },
        ]);
        // Parses fine as a profile — but binds nothing anchored in the
        // AssemblyRegistry, so this frontend does not surface it anywhere.
        fetchDocumentMock.mockResolvedValueOnce(makeJsonResponse({
            subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            name: 'Unbound Seller',
            assemblyBindings: [{
                bindingId: 'binding-x',
                subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                assemblySlug: 'asm-not-anchored',
                counterpartyBindings: [],
            }],
        }));

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.catalogues).toHaveLength(0);
        expect(result.source.ipfs).toBe(0);
    });

    it('excludes sellers whose documents cannot be fetched', async () => {
        getActiveSellersMock.mockResolvedValueOnce([
            {
                address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
                role: 1,
                metadataURI: 'ipfs://bad',
            },
        ]);
        fetchDocumentMock.mockResolvedValueOnce({ ok: false } as Response);

        const result = await discoveryService.listCatalogues({} as never, 31337, ANCHORED);

        expect(result.catalogues).toHaveLength(0);
        expect(result.source.ipfs).toBe(0);
        expect(result.source.mock).toBe(0);
    });
});
