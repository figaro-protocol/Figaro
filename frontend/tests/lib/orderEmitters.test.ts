import { beforeEach, describe, expect, it, vi } from 'vitest';

// Batch and Core are equivalent to a reader: FigaroBatchVerifier emits
// FigaroCore's own order and process events for every batched order, so the
// order readers ask BOTH addresses and fold what they get in chain order. A
// reader that asked FigaroCore alone would render nothing for batched trade.

const { cachedGetLogsMock, CORE, VERIFIER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: '0x1111111111111111111111111111111111111111',
    VERIFIER: '0x2222222222222222222222222222222222222222',
}));

vi.mock('@/lib/kernel/eventCache', () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));

vi.mock('@/lib/kernel/contracts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/kernel/contracts')>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));

import {
    getAllOrderCommitted,
    getAllOrderResolved,
    getAllProcessResolved,
} from '@/lib/kernel/indexer';

const CLIENT = {} as never;

describe('the order readers fold both emitters', () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
        cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string }) =>
            opts.address === CORE
                ? [{ blockNumber: 5n, logIndex: 1, transactionHash: '0xcore' }]
                : [
                      { blockNumber: 3n, logIndex: 0, transactionHash: '0xbatch-early' },
                      { blockNumber: 5n, logIndex: 0, transactionHash: '0xbatch-same-block' },
                  ],
        );
    });

    for (const [name, read] of [
        ['OrderCommitted', getAllOrderCommitted],
        ['OrderResolved', getAllOrderResolved],
        ['ProcessResolved', getAllProcessResolved],
    ] as const) {
        it(`${name} is read from the Core and the verifier, in chain order`, async () => {
            const logs = await read(CLIENT, 31337);
            const asked = cachedGetLogsMock.mock.calls.map((c) => c[2].address).sort();
            expect(asked).toEqual([CORE, VERIFIER].sort());
            expect(cachedGetLogsMock.mock.calls.every((c) => c[2].eventName === name)).toBe(true);
            expect(logs.map((l) => l.transactionHash)).toEqual(['0xbatch-early', '0xbatch-same-block', '0xcore']);
        });
    }

    it('a network with no verifier configured reads the Core alone', async () => {
        vi.resetModules();
        vi.doMock('@/lib/kernel/contracts', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/kernel/contracts')>()),
            CONTRACTS: { core: CORE, batchVerifier: '' },
        }));
        const { getAllOrderCommitted: read } = await import('@/lib/kernel/indexer');
        await read(CLIENT, 31337);
        expect(cachedGetLogsMock.mock.calls.map((c) => c[2].address)).toEqual([CORE]);
    });
});
