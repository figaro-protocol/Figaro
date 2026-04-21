import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOperatorState } from '@/lib/core/indexer';

// ── Mock the event cache and contract addresses ───────────────────────────────
// getOperatorState calls getAllOperatorRegistered etc., which call cachedGetLogsMulti,
// which in turn calls cachedGetLogs from eventCache. Mocking at that layer lets us
// inject fake event logs while running the real reconstruction logic in getOperatorState.

const cachedGetLogsMock = vi.fn();

vi.mock('@/lib/core/eventCache', () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
}));

// Provide a non-null operatorRegistry so the event fetchers don't short-circuit.
vi.mock('@/lib/mechanisms/contracts', () => ({
    MECHANISM_CONTRACTS: { operatorRegistry: '0x1111111111111111111111111111111111111111' },
    getOperatorRegistry: () => '0x1111111111111111111111111111111111111111',
    OPERATOR_REGISTRY_ABI: [],
}));

vi.mock('@/lib/core/contracts', () => ({
    CONTRACTS: { batchVerifier: null, orderManager: null },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPERATOR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CLIENT = {} as never;
const CHAIN_ID = 31337;

type MockLog = { blockNumber: bigint | number | null; args: Record<string, unknown> };

function regLog(overrides?: Partial<{
    operator: string; role: number; metadataURI: string; blockNumber: bigint;
}>): MockLog {
    return {
        blockNumber: overrides?.blockNumber ?? 100n,
        args: {
            operator: overrides?.operator ?? OPERATOR,
            role: overrides?.role ?? 1,
            metadataURI: overrides?.metadataURI ?? 'ipfs://QmProfile',
        },
    };
}

function updateLog(overrides?: Partial<{ operator: string; metadataURI: string; blockNumber: bigint }>): MockLog {
    return {
        blockNumber: overrides?.blockNumber ?? 200n,
        args: {
            operator: overrides?.operator ?? OPERATOR,
            role: 1,
            metadataURI: overrides?.metadataURI ?? 'ipfs://QmUpdated',
        },
    };
}

function deactivateLog(operator = OPERATOR, blockNumber: bigint = 300n): MockLog {
    return { blockNumber, args: { operator } };
}

function reactivateLog(operator = OPERATOR, blockNumber: bigint = 400n): MockLog {
    return { blockNumber, args: { operator } };
}

function withdrawLog(operator = OPERATOR): MockLog {
    return { blockNumber: 500n, args: { operator } };
}

// Sets up cachedGetLogs to return specific logs per event name.
function mockEvents(events: {
    registered?: MockLog[];
    updated?: MockLog[];
    deactivated?: MockLog[];
    reactivated?: MockLog[];
    withdrawn?: MockLog[];
}) {
    cachedGetLogsMock.mockImplementation(
        (_client: unknown, _chainId: unknown, opts: { eventName: string }) => {
            switch (opts.eventName) {
                case 'OperatorRegistered': return Promise.resolve(events.registered ?? []);
                case 'OperatorUpdated': return Promise.resolve(events.updated ?? []);
                case 'OperatorDeactivated': return Promise.resolve(events.deactivated ?? []);
                case 'OperatorReactivated': return Promise.resolve(events.reactivated ?? []);
                case 'OperatorWithdrawn': return Promise.resolve(events.withdrawn ?? []);
                default: return Promise.resolve([]);
            }
        },
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getOperatorState', () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
    });

    it('returns null for an operator that has never registered', async () => {
        mockEvents({ registered: [] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).toBeNull();
    });

    it('returns active state for a freshly registered operator', async () => {
        mockEvents({ registered: [regLog()] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.role).toBe(1);
        expect(result!.active).toBe(true);
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
        expect(result!.registeredBlock).toBe(100n);
    });

    it('returns null for an operator that has withdrawn', async () => {
        mockEvents({ registered: [regLog()], withdrawn: [withdrawLog()] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).toBeNull();
    });

    it('returns inactive state after deactivation', async () => {
        mockEvents({ registered: [regLog()], deactivated: [deactivateLog(OPERATOR, 300n)] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.active).toBe(false);
    });

    it('returns active state after deactivation then reactivation', async () => {
        mockEvents({
            registered: [regLog()],
            deactivated: [deactivateLog(OPERATOR, 300n)],
            reactivated: [reactivateLog(OPERATOR, 400n)],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.active).toBe(true);
    });

    it('returns inactive after a later deactivation overrides an earlier reactivation', async () => {
        mockEvents({
            registered: [regLog()],
            deactivated: [deactivateLog(OPERATOR, 500n)],
            reactivated: [reactivateLog(OPERATOR, 400n)],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.active).toBe(false);
    });

    it('returns latest metadataURI from update logs when multiple updates exist', async () => {
        mockEvents({
            registered: [regLog({ metadataURI: 'ipfs://QmOld' })],
            updated: [
                updateLog({ metadataURI: 'ipfs://QmFirst', blockNumber: 200n }),
                updateLog({ metadataURI: 'ipfs://QmLatest', blockNumber: 300n }),
            ],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.metadataURI).toBe('ipfs://QmLatest');
    });

    it('uses registration metadataURI when no updates exist', async () => {
        mockEvents({ registered: [regLog({ metadataURI: 'ipfs://QmOriginal' })] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.metadataURI).toBe('ipfs://QmOriginal');
    });

    it('is case-insensitive for the operator address lookup', async () => {
        mockEvents({ registered: [regLog({ operator: OPERATOR.toLowerCase() })] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR.toUpperCase());

        expect(result).not.toBeNull();
        expect(result!.active).toBe(true);
    });

    it('returns null when the registration belongs to a different operator', async () => {
        const OTHER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        mockEvents({ registered: [regLog({ operator: OTHER })] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).toBeNull();
    });

    it('handles a number blockNumber in the registration log', async () => {
        const log: MockLog = {
            blockNumber: 100,
            args: { operator: OPERATOR, role: 2, metadataURI: 'ipfs://QmNum' },
        };
        mockEvents({ registered: [log] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.registeredBlock).toBe(100n);
    });

    it('returns null registeredBlock when blockNumber is null', async () => {
        const log: MockLog = {
            blockNumber: null,
            args: { operator: OPERATOR, role: 1, metadataURI: 'ipfs://QmNull' },
        };
        mockEvents({ registered: [log] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.registeredBlock).toBeNull();
    });

    it('ignores deactivation and reactivation events from other operators', async () => {
        const OTHER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        mockEvents({
            registered: [regLog()],
            deactivated: [deactivateLog(OTHER, 300n)],
            reactivated: [],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.active).toBe(true);
    });
});
