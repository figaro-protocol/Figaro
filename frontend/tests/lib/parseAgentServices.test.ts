import { describe, expect, it } from 'vitest';

import { parseAgentServices } from '@/lib/member/useMembersRegistry';

describe('parseAgentServices', () => {
    it('returns reachable=false when no services key is present', () => {
        const result = parseAgentServices({ name: 'Bob Pizza' });
        expect(result.reachable).toBe(false);
        expect(result.services).toEqual({});
        expect(result.capabilities).toEqual([]);
    });

    it('returns reachable=false when services is not an object', () => {
        const result = parseAgentServices({ services: 'not-an-object' });
        expect(result.reachable).toBe(false);
    });

    it('returns reachable=false when services is null', () => {
        const result = parseAgentServices({ services: null });
        expect(result.reachable).toBe(false);
    });

    it('parses a full agent metadata object', () => {
        const result = parseAgentServices({
            name: 'Driver Agent #42',
            services: {
                mcp: 'https://agent-42.example.com/mcp',
                a2a: 'https://agent-42.example.com/a2a',
                rest: 'https://agent-42.example.com/v1',
                did: 'did:web:agent-42.example.com',
                ens: 'agent-42.figaro.eth',
            },
            capabilities: ['route-optimization', 'live-eta', 'multi-stop-batching'],
        });

        expect(result.reachable).toBe(true);
        expect(result.services.mcp).toBe('https://agent-42.example.com/mcp');
        expect(result.services.a2a).toBe('https://agent-42.example.com/a2a');
        expect(result.services.rest).toBe('https://agent-42.example.com/v1');
        expect(result.services.did).toBe('did:web:agent-42.example.com');
        expect(result.services.ens).toBe('agent-42.figaro.eth');
        expect(result.capabilities).toEqual(['route-optimization', 'live-eta', 'multi-stop-batching']);
    });

    it('handles partial service endpoints', () => {
        const result = parseAgentServices({
            services: { mcp: 'https://agent.example.com/mcp' },
        });

        expect(result.reachable).toBe(true);
        expect(result.services.mcp).toBe('https://agent.example.com/mcp');
        expect(result.services.a2a).toBeUndefined();
        expect(result.services.rest).toBeUndefined();
        expect(result.services.did).toBeUndefined();
        expect(result.services.ens).toBeUndefined();
        expect(result.capabilities).toEqual([]);
    });

    it('ignores non-string service values', () => {
        const result = parseAgentServices({
            services: { mcp: 123, a2a: true, rest: null, did: 'did:web:seller.example.com' },
        });

        expect(result.reachable).toBe(true);
        expect(result.services.mcp).toBeUndefined();
        expect(result.services.a2a).toBeUndefined();
        expect(result.services.rest).toBeUndefined();
        expect(result.services.did).toBe('did:web:seller.example.com');
    });

    it('filters non-string capability entries', () => {
        const result = parseAgentServices({
            services: { mcp: 'https://example.com' },
            capabilities: ['valid', 42, null, 'also-valid', { nested: true }],
        });

        expect(result.capabilities).toEqual(['valid', 'also-valid']);
    });

    it('treats missing capabilities as empty array', () => {
        const result = parseAgentServices({
            services: { mcp: 'https://example.com' },
        });

        expect(result.capabilities).toEqual([]);
    });

    it('treats non-array capabilities as empty array', () => {
        const result = parseAgentServices({
            services: { mcp: 'https://example.com' },
            capabilities: 'not-an-array',
        });

        expect(result.capabilities).toEqual([]);
    });
});
