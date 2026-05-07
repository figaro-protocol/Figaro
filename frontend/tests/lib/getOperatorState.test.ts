import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOperatorState } from '@/lib/core/indexer';

// ── Mock the event cache and contract addresses ───────────────────────────────
// getOperatorState calls getAllOperatorRegistered + getAllOperatorProfileUpdated
// + getAllOperatorWithdrawn, which call cachedGetLogsMulti, which in turn calls
// cachedGetLogs from eventCache. Mocking at that layer lets us inject fake
// event logs while running the real reconstruction logic.
//
// "Currently registered" = a Registered event newer than any Withdrawn event
// for the same address. The current metadataURI is the most recent
// ProfileUpdated event that post-dates the registration, falling back to the
// metadataURI carried by the registration itself.

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
    operator: string; metadataURI: string; blockNumber: bigint;
}>): MockLog {
    return {
        blockNumber: overrides?.blockNumber ?? 100n,
        args: {
            operator: overrides?.operator ?? OPERATOR,
            metadataURI: overrides?.metadataURI ?? 'ipfs://QmProfile',
        },
    };
}

function profileUpdatedLog(overrides?: Partial<{
    operator: string; metadataURI: string; blockNumber: bigint;
}>): MockLog {
    return {
        blockNumber: overrides?.blockNumber ?? 200n,
        args: {
            operator: overrides?.operator ?? OPERATOR,
            metadataURI: overrides?.metadataURI ?? 'ipfs://QmProfileV2',
        },
    };
}

function withdrawLog(operator = OPERATOR, blockNumber: bigint = 500n): MockLog {
    return { blockNumber, args: { operator } };
}

// Sets up cachedGetLogs to return specific logs per event name.
function mockEvents(events: {
    registered?: MockLog[];
    profileUpdated?: MockLog[];
    withdrawn?: MockLog[];
}) {
    cachedGetLogsMock.mockImplementation(
        (_client: unknown, _chainId: unknown, opts: { eventName: string }) => {
            switch (opts.eventName) {
                case 'OperatorRegistered': return Promise.resolve(events.registered ?? []);
                case 'OperatorProfileUpdated': return Promise.resolve(events.profileUpdated ?? []);
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

    it('returns the registered profile for a freshly registered operator', async () => {
        mockEvents({ registered: [regLog()] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
        expect(result!.registeredBlock).toBe(100n);
    });

    it('applies the most recent ProfileUpdated event after registration', async () => {
        mockEvents({
            registered: [regLog()],
            profileUpdated: [
                profileUpdatedLog({ blockNumber: 200n, metadataURI: 'ipfs://QmV2' }),
                profileUpdatedLog({ blockNumber: 300n, metadataURI: 'ipfs://QmV3' }),
            ],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmV3');
        expect(result!.registeredBlock).toBe(100n);
    });

    it('ignores ProfileUpdated events that pre-date the surviving registration', async () => {
        mockEvents({
            registered: [regLog({ blockNumber: 600n, metadataURI: 'ipfs://QmFresh' })],
            profileUpdated: [
                profileUpdatedLog({ blockNumber: 100n, metadataURI: 'ipfs://QmStale' }),
            ],
            withdrawn: [withdrawLog(OPERATOR, 500n)],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmFresh');
    });

    it('returns null after the operator withdraws', async () => {
        mockEvents({ registered: [regLog()], withdrawn: [withdrawLog()] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).toBeNull();
    });

    it('returns the new profile after withdraw + re-register cycle', async () => {
        mockEvents({
            registered: [
                regLog({ blockNumber: 100n, metadataURI: 'ipfs://QmFirst' }),
                regLog({ blockNumber: 600n, metadataURI: 'ipfs://QmSecond' }),
            ],
            withdrawn: [withdrawLog(OPERATOR, 500n)],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmSecond');
        expect(result!.registeredBlock).toBe(600n);
    });

    it('uses the registration metadataURI when no ProfileUpdated event exists', async () => {
        mockEvents({ registered: [regLog({ metadataURI: 'ipfs://QmOriginal' })] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.metadataURI).toBe('ipfs://QmOriginal');
    });

    it('is case-insensitive for the operator address lookup', async () => {
        mockEvents({ registered: [regLog({ operator: OPERATOR.toLowerCase() })] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR.toUpperCase());

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
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
            args: { operator: OPERATOR, metadataURI: 'ipfs://QmNum' },
        };
        mockEvents({ registered: [log] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result!.registeredBlock).toBe(100n);
    });

    it('returns null registeredBlock when blockNumber is null', async () => {
        const log: MockLog = {
            blockNumber: null,
            args: { operator: OPERATOR, metadataURI: 'ipfs://QmNull' },
        };
        mockEvents({ registered: [log] });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.registeredBlock).toBeNull();
    });

    it('ignores withdraw events for other operators', async () => {
        const OTHER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        mockEvents({
            registered: [regLog()],
            withdrawn: [withdrawLog(OTHER, 500n)],
        });

        const result = await getOperatorState(CLIENT, CHAIN_ID, OPERATOR);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
    });
});
