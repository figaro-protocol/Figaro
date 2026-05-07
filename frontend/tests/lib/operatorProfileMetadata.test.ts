import { describe, expect, it } from 'vitest';

import {
    parseOperatorProfileDocument,
    projectAgentServices,
    tryParseOperatorProfileDocument,
} from '@/lib/shared/operatorProfileMetadata';

describe('operator profile metadata parser', () => {
    const VALID_DOC = {
        name: 'Bob Pizza',
        description: 'Authentic NY-style',
        location: 'Manhattan, NY',
        catalogueURI: 'ipfs://QmCatalogue123',
        acceptedTokens: [
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        ],
        mechanisms: ['core-orders', 'delivery-coordinator'],
        services: {
            mcp: 'https://example.com/mcp',
            a2a: 'https://example.com/a2a',
            rest: 'https://example.com/v1',
            did: 'did:web:example.com',
            ens: 'example.figaro.eth',
        },
        capabilities: ['route-optimization'],
        branding: {
            displayName: "Bob's Pizza",
            logoURI: 'ipfs://QmLogo',
            accentColor: '#c2410c',
            themeClass: 'merchant-pizza',
        },
        assets: {
            cssURI: 'ipfs://QmCss',
            imageBaseURI: 'ipfs://QmImages/',
        },
        version: '1.0.0',
    };

    describe('parseOperatorProfileDocument (strict)', () => {
        it('parses a fully-populated profile', () => {
            const result = parseOperatorProfileDocument(VALID_DOC);

            expect(result.name).toBe('Bob Pizza');
            expect(result.description).toBe('Authentic NY-style');
            expect(result.acceptedTokens).toHaveLength(2);
            expect(result.acceptedTokens?.[0]).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
            expect(result.mechanisms).toEqual(['core-orders', 'delivery-coordinator']);
            expect(result.services?.mcp).toBe('https://example.com/mcp');
            expect(result.capabilities).toEqual(['route-optimization']);
            expect(result.branding?.themeClass).toBe('merchant-pizza');
            expect(result.assets?.cssURI).toBe('ipfs://QmCss');
            expect(result.version).toBe('1.0.0');
        });

        it('parses a minimal profile with only name', () => {
            const result = parseOperatorProfileDocument({ name: 'Minimal Operator' });

            expect(result.name).toBe('Minimal Operator');
            expect(result.description).toBeUndefined();
            expect(result.acceptedTokens).toBeUndefined();
            expect(result.services).toBeUndefined();
        });

        it('throws when name is missing', () => {
            expect(() => parseOperatorProfileDocument({}))
                .toThrow(/name must be a string/);
        });

        it('throws when name is not a string', () => {
            expect(() => parseOperatorProfileDocument({ name: 42 }))
                .toThrow(/name must be a string/);
        });

        it('throws when acceptedTokens carries a malformed address', () => {
            expect(() => parseOperatorProfileDocument({
                name: 'Bob',
                acceptedTokens: ['not-an-address'],
            })).toThrow(/acceptedTokens\[0\] must be a 20-byte hex address/);
        });

        it('accepts acceptedTokens as object-with-address (legacy form)', () => {
            const result = parseOperatorProfileDocument({
                name: 'Bob',
                acceptedTokens: [
                    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
                ],
            });

            expect(result.acceptedTokens?.[0]).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
        });

        it('throws when services is not an object', () => {
            expect(() => parseOperatorProfileDocument({
                name: 'Bob',
                services: 'not-an-object',
            })).toThrow(/services must be an object/);
        });

        it('drops services fields that are not strings', () => {
            const result = parseOperatorProfileDocument({
                name: 'Bob',
                services: { mcp: 'https://example.com/mcp' },
            });

            expect(result.services?.mcp).toBe('https://example.com/mcp');
            expect(result.services?.a2a).toBeUndefined();
        });

        it('round-trips a parsed document back into the parser', () => {
            const first = parseOperatorProfileDocument(VALID_DOC);
            const second = parseOperatorProfileDocument(first);

            expect(second).toEqual(first);
        });
    });

    describe('tryParseOperatorProfileDocument (lenient)', () => {
        it('returns null on a missing name', () => {
            expect(tryParseOperatorProfileDocument({})).toBeNull();
        });

        it('returns null on non-object input', () => {
            expect(tryParseOperatorProfileDocument(null)).toBeNull();
            expect(tryParseOperatorProfileDocument('string')).toBeNull();
            expect(tryParseOperatorProfileDocument([])).toBeNull();
        });

        it('returns the parsed shape on a valid document', () => {
            const result = tryParseOperatorProfileDocument(VALID_DOC);
            expect(result?.name).toBe('Bob Pizza');
        });

        it('returns null when acceptedTokens is malformed (does not throw)', () => {
            expect(tryParseOperatorProfileDocument({
                name: 'Bob',
                acceptedTokens: ['malformed'],
            })).toBeNull();
        });
    });

    describe('projectAgentServices', () => {
        it('returns isAgent=false when no services key is present', () => {
            const result = projectAgentServices({ name: 'Bob' });
            expect(result.isAgent).toBe(false);
            expect(result.services).toEqual({});
            expect(result.capabilities).toEqual([]);
        });

        it('returns isAgent=true even without a name (services-only docs)', () => {
            const result = projectAgentServices({
                services: { mcp: 'https://example.com/mcp' },
            });
            expect(result.isAgent).toBe(true);
            expect(result.services.mcp).toBe('https://example.com/mcp');
        });

        it('returns isAgent=false when input is not an object', () => {
            expect(projectAgentServices(null).isAgent).toBe(false);
            expect(projectAgentServices('string').isAgent).toBe(false);
            expect(projectAgentServices([]).isAgent).toBe(false);
        });

        it('drops non-string capability entries', () => {
            const result = projectAgentServices({
                services: { mcp: 'https://example.com' },
                capabilities: ['valid', 42, null, 'also-valid'],
            });
            expect(result.capabilities).toEqual(['valid', 'also-valid']);
        });
    });
});
