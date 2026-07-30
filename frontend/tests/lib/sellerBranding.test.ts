import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    fetchMemberBranding,
    clearBrandingCache,
    resolveMemberBrandingFromMemberProfile,
} from '@/lib/seller/memberBranding';
import { SELLER_PROFILE_METADATA_EXAMPLE } from './__fixtures__/sellerMetadata';

describe('memberBranding', () => {

    describe('fetchMemberBranding', () => {
        beforeEach(() => {
            clearBrandingCache();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns null for an empty URI', async () => {
            const result = await fetchMemberBranding('');
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
                    themeClass: 'seller-pizza',
                },
                assets: {
                    imageBaseURI: 'ipfs://QmImages/',
                },
            };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMemberBranding('ipfs://QmMetadata');

            expect(result).not.toBeNull();
            expect(result!.branding.logoURI).toBe('ipfs://QmLogo123');
            expect(result!.logoURI).toBe('ipfs://QmLogo123'); // raw locator; render layer resolves once via resolveImageUri
            expect(result!.name).toBe("Bob's Pizza Palace");
        });

        it('returns branding when only the asset base URI exists (no logo)', async () => {
            const mockDoc = {
                name: 'Minimal Seller',
                assets: {
                    imageBaseURI: 'ipfs://QmBase',
                },
            };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMemberBranding('http://example.com/metadata.json');

            expect(result).not.toBeNull();
            expect(result!.assets.imageBaseURI).toBe('ipfs://QmBase');
            expect(result!.branding.logoURI).toBeUndefined();
            expect(result!.logoURI).toBeUndefined();
        });

        it('returns null when fetch fails', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response);

            const result = await fetchMemberBranding('ipfs://QmMissing');
            expect(result).toBeNull();
        });

        it('returns null when fetch throws', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchMemberBranding('ipfs://QmUnreachable');
            expect(result).toBeNull();
        });

        it('returns null for non-object response', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve('not an object'),
                text: () => Promise.resolve(JSON.stringify('not an object')),
            } as Response);

            const result = await fetchMemberBranding('ipfs://QmNotJson');
            expect(result).toBeNull();
        });

        it('returns null for array response', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([1, 2, 3]),
                text: () => Promise.resolve(JSON.stringify([1, 2, 3])),
            } as Response);

            const result = await fetchMemberBranding('ipfs://QmArray');
            expect(result).toBeNull();
        });

        it('caches results by URI', async () => {
            const mockDoc = { name: 'Cached', branding: { accentColor: '#000' } };
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            await fetchMemberBranding('ipfs://QmCached');
            await fetchMemberBranding('ipfs://QmCached');

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

            await fetchMemberBranding('ipfs://QmClearTest');
            clearBrandingCache();
            await fetchMemberBranding('ipfs://QmClearTest');

            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('handles document with no branding or assets gracefully', async () => {
            const mockDoc = { name: 'Bare Seller' };

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockDoc),
                text: () => Promise.resolve(JSON.stringify(mockDoc)),
            } as Response);

            const result = await fetchMemberBranding('http://example.com/bare.json');

            expect(result).not.toBeNull();
            expect(result!.branding).toEqual({
                displayName: undefined,
                logoURI: undefined,
                heroImageURI: undefined,
                accentColor: undefined,
                themeClass: undefined,
            });
            expect(result!.assets).toEqual({
                imageBaseURI: undefined,
            });
            expect(result!.name).toBe('Bare Seller');
        });

        it('resolves branding directly from seller catalogue metadata', () => {
            const result = resolveMemberBrandingFromMemberProfile(SELLER_PROFILE_METADATA_EXAMPLE);

            expect(result).not.toBeNull();
            expect(result!.logoURI).toBe('ipfs://example/logo.png');
        });
    });
});
