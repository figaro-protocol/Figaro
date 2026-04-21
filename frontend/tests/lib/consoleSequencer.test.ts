import { describe, expect, it } from 'vitest';

describe('console provider — sequencer surface', () => {
    it('imports SequencerClient and SequencerStatus from SDK', async () => {
        const { SequencerClient } = await import('@figaro/core/agent');
        expect(typeof SequencerClient).toBe('function');

        // Verify the client can be constructed
        const client = new SequencerClient({ url: 'http://localhost:3001' });
        expect(typeof client.submit).toBe('function');
        expect(typeof client.status).toBe('function');
        expect(typeof client.isAvailable).toBe('function');
    });

    it('SequencerClient.isAvailable returns false for unreachable server', async () => {
        const { SequencerClient } = await import('@figaro/core/agent');
        const client = new SequencerClient({ url: 'http://127.0.0.1:19999' });
        const available = await client.isAvailable();
        expect(available).toBe(false);
    });
});
