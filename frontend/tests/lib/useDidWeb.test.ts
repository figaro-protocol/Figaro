import { describe, expect, it } from 'vitest';
import {
    isDidWeb,
    didWebToUrl,
    extractEthereumAddresses,
} from '@/lib/agent/useDidWeb';
import type { DIDDocument } from '@/lib/agent/useDidWeb';

describe('isDidWeb', () => {
    it('accepts valid did:web identifiers', () => {
        expect(isDidWeb('did:web:example.com')).toBe(true);
        expect(isDidWeb('did:web:example.com:user:alice')).toBe(true);
        expect(isDidWeb('did:web:example.com%3A3000')).toBe(true);
    });

    it('rejects non-did:web strings', () => {
        expect(isDidWeb('did:ethr:0x1234')).toBe(false);
        expect(isDidWeb('not-a-did')).toBe(false);
        expect(isDidWeb('')).toBe(false);
        expect(isDidWeb('did:web:')).toBe(false);
    });
});

describe('didWebToUrl', () => {
    it('resolves domain-only to /.well-known/did.json', () => {
        expect(didWebToUrl('did:web:example.com')).toBe(
            'https://example.com/.well-known/did.json',
        );
    });

    it('resolves domain with path segments', () => {
        expect(didWebToUrl('did:web:example.com:user:alice')).toBe(
            'https://example.com/user/alice/did.json',
        );
    });

    it('decodes percent-encoded port', () => {
        expect(didWebToUrl('did:web:example.com%3A3000')).toBe(
            'https://example.com:3000/.well-known/did.json',
        );
    });

    it('throws for non-did:web', () => {
        expect(() => didWebToUrl('did:ethr:0x1234')).toThrow('Not a did:web');
    });
});

describe('extractEthereumAddresses', () => {
    it('extracts CAIP-10 Ethereum address from verification method', () => {
        const doc: DIDDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: 'did:web:example.com',
            verificationMethod: [{
                id: 'did:web:example.com#controller',
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: 'did:web:example.com',
                blockchainAccountId: 'eip155:31337:0x89a932207c485f85226d86f7cd486a89a24fcc12',
            }],
        };

        const result = extractEthereumAddresses(doc);
        expect(result).toHaveLength(1);
        expect(result[0].address).toBe('0x89a932207c485f85226d86f7cd486a89a24fcc12');
        expect(result[0].chainId).toBe(31337);
    });

    it('returns empty when no verificationMethod', () => {
        const doc: DIDDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: 'did:web:example.com',
        };
        expect(extractEthereumAddresses(doc)).toHaveLength(0);
    });

    it('ignores non-secp256k1 methods', () => {
        const doc: DIDDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: 'did:web:example.com',
            verificationMethod: [{
                id: 'did:web:example.com#key-0',
                type: 'JsonWebKey2020',
                controller: 'did:web:example.com',
                publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc' },
            }],
        };
        expect(extractEthereumAddresses(doc)).toHaveLength(0);
    });
});
