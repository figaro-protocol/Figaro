import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MerchantBrandingModule } from '@/components/modules/MerchantBrandingModule';
import {
    resolveContentURI,
    fetchMerchantBranding,
    clearBrandingCache,
    resolveMerchantBrandingFromSellerCatalogue,
} from '@/lib/shared/merchantBranding';
import { SELLER_CATALOGUE_METADATA_EXAMPLE } from '@/lib/shared/sellerCatalogueMetadata';

describe('merchantBranding', () => {
    describe('resolveContentURI', () => {
        it('resolves ipfs:// URIs to gateway URLs', () => {
            const url = resolveContentURI('ipfs://QmXyz123/logo.png');
            expect(url).toBe('http://127.0.0.1:8080/ipfs/QmXyz123/logo.png');
        });

        it('resolves ipfs:// CID-only URIs', () => {
            const url = resolveContentURI('ipfs://QmXyz123');
            expect(url).toBe('http://127.0.0.1:8080/ipfs/QmXyz123');
        });

        it('passes through http:// URIs', () => {
            const url = resolveContentURI('http://example.com/logo.png');
            expect(url).toBe('http://example.com/logo.png');
        });

        it('passes through https:// URIs', () => {
            const url = resolveContentURI('https://cdn.example.com/logo.png');
            expect(url).toBe('https://cdn.example.com/logo.png');
        });

        it('resolves bare CIDv0 strings', () => {
            const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
            const url = resolveContentURI(cid);
            expect(url).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
        });

        it('resolves bare CIDv1 strings', () => {
            const url = resolveContentURI('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
            expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8080\/ipfs\/bafy/);
        });

        it('rejects unknown/dangerous schemes (RA-2)', () => {
            expect(resolveContentURI('data:image/png;base64,abc')).toBe('');
            expect(resolveContentURI('javascript:alert(1)')).toBe('');
            expect(resolveContentURI('blob:http://evil.com/abc')).toBe('');
        });
    });

    describe('fetchMerchantBranding', () => {
        beforeEach(() => {
            clearBrandingCache();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns null for an empty URI', async () => {
            const result = await fetchMerchantBranding('');
            expect(result).toBeNull();
        });

        it('extracts branding fields from a valid metadata document', async () => {
            const mockDoc = {
                name: "Bob's Pizza Palace",
                branding: {
                    displayName: "Bob's Pizza",
                    logoURI: 'ipfs://QmLogo123',
                    heroImageURI: 'ipfs://QmHero456',
                    accentColor: '#c2410c',
                    themeClass: 'merchant-pizza',
                },
                assets: {
                    cssURI: 'ipfs://QmCSS789',
                    imageBaseURI: 'ipfs://QmImages/',
                },
            };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMerchantBranding('ipfs://QmMetadata');

            expect(result).not.toBeNull();
            expect(result!.branding.displayName).toBe("Bob's Pizza");
            expect(result!.branding.accentColor).toBe('#c2410c');
            expect(result!.branding.themeClass).toBe('merchant-pizza');
            expect(result!.logoURL).toBe('http://127.0.0.1:8080/ipfs/QmLogo123');
            expect(result!.heroImageURL).toBe('http://127.0.0.1:8080/ipfs/QmHero456');
            expect(result!.cssURL).toBe('http://127.0.0.1:8080/ipfs/QmCSS789');
            expect(result!.name).toBe("Bob's Pizza Palace");
        });

        it('returns partial branding when only some fields exist', async () => {
            const mockDoc = {
                name: 'Minimal Merchant',
                branding: {
                    accentColor: '#333',
                },
            };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMerchantBranding('http://example.com/metadata.json');

            expect(result).not.toBeNull();
            expect(result!.branding.accentColor).toBe('#333');
            expect(result!.branding.logoURI).toBeUndefined();
            expect(result!.logoURL).toBeUndefined();
            expect(result!.assets.cssURI).toBeUndefined();
        });

        it('returns null when fetch fails', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response);

            const result = await fetchMerchantBranding('ipfs://QmMissing');
            expect(result).toBeNull();
        });

        it('returns null when fetch throws', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchMerchantBranding('ipfs://QmUnreachable');
            expect(result).toBeNull();
        });

        it('returns null for non-object response', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve('not an object'),
                text: () => Promise.resolve(JSON.stringify('not an object')),
            } as Response);

            const result = await fetchMerchantBranding('ipfs://QmNotJson');
            expect(result).toBeNull();
        });

        it('returns null for array response', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([1, 2, 3]),
                text: () => Promise.resolve(JSON.stringify([1, 2, 3])),
            } as Response);

            const result = await fetchMerchantBranding('ipfs://QmArray');
            expect(result).toBeNull();
        });

        it('caches results by URI', async () => {
            const mockDoc = { name: 'Cached', branding: { accentColor: '#000' } };
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            await fetchMerchantBranding('ipfs://QmCached');
            await fetchMerchantBranding('ipfs://QmCached');

            // Only one fetch despite two calls
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('clearBrandingCache resets the cache', async () => {
            const mockDoc = { name: 'Cached', branding: {} };
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            await fetchMerchantBranding('ipfs://QmClearTest');
            clearBrandingCache();
            await fetchMerchantBranding('ipfs://QmClearTest');

            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('handles document with no branding or assets gracefully', async () => {
            const mockDoc = { name: 'Bare Merchant' };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMerchantBranding('http://example.com/bare.json');

            expect(result).not.toBeNull();
            expect(result!.branding).toEqual({
                displayName: undefined,
                logoURI: undefined,
                heroImageURI: undefined,
                accentColor: undefined,
                themeClass: undefined,
            });
            expect(result!.assets).toEqual({
                cssURI: undefined,
                imageBaseURI: undefined,
            });
            expect(result!.name).toBe('Bare Merchant');
        });

        it('resolves branding directly from seller catalogue metadata', () => {
            const result = resolveMerchantBrandingFromSellerCatalogue(SELLER_CATALOGUE_METADATA_EXAMPLE);

            expect(result).not.toBeNull();
            expect(result!.branding.displayName).toBe("Bob's Pizza Palace");
            expect(result!.logoURL).toBe('http://127.0.0.1:8080/ipfs/example/logo.png');
            expect(result!.heroImageURL).toBe('http://127.0.0.1:8080/ipfs/example/hero.png');
            expect(result!.cssURL).toBe('http://127.0.0.1:8080/ipfs/example/theme.css');
        });

        it('applies a branding override without fetching operator metadata', async () => {
            const brandingOverride = resolveMerchantBrandingFromSellerCatalogue(SELLER_CATALOGUE_METADATA_EXAMPLE);
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('.merchant-pizza { color: red; }'),
            } as Response);

            render(createElement(
                MerchantBrandingModule,
                {
                    sellerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                    brandingOverride,
                    dataSkinId: 'binding-bobs-pizza-palace-local-anvil',
                    children: createElement('div', null, 'Branded child'),
                },
                createElement('div', null, 'Branded child')
            ));

            const wrapper = screen.getByText('Branded child').parentElement as HTMLDivElement;

            await waitFor(() => {
                expect(wrapper.className).toContain('merchant-pizza');
                expect(wrapper.style.getPropertyValue('--merchant-accent')).toBe('#c2410c');
            });

            expect(wrapper.getAttribute('data-skin')).toBe('binding-bobs-pizza-palace-local-anvil');
            expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:8080/ipfs/example/theme.css');
        });
    });
});
