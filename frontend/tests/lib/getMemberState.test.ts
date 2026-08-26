import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { getMemberState } from '@/lib/protocol/membersRegistryIndexer';

// ── Mock the event cache and contract addresses ───────────────────────────────
// getMemberState fetches the three MembersRegistry streams through
// cachedGetLogsMulti, which in turn calls cachedGetLogs from eventCache.
// Mocking at that layer lets us inject fake event logs while running the real
// SDK liveness fold (`reconstructDiscovery`).
//
// "Currently registered" = a Registered event newer than any Withdrawn event
// for the same address. The current metadataURI is the most recent
// ProfileUpdated event that post-dates the registration, falling back to the
// metadataURI carried by the registration itself.

const cachedGetLogsMock = vi.fn();

vi.mock('@/lib/kernel/eventCache', () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
}));

// Provide a non-null membersRegistry so the event fetchers don't short-circuit.
// The indexer reads it from core's CONTRACTS (core/ never imports mechanisms/).
// Everything else (MEMBERS_REGISTRY_ABI) passes through from the real barrel.
vi.mock('@/lib/kernel/contracts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/kernel/contracts')>()),
    CONTRACTS: {
        membersRegistry: '0x1111111111111111111111111111111111111111',
    },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const SELLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CLIENT = {} as never;
const CHAIN_ID = 31337;

// Fixtures are REAL encoded logs (data + topics via `encodeEventLog`): the
// reader decodes through the SDK's raw-log parser, so args-only stubs would
// silently parse to nothing.
type MockLog = { blockNumber: bigint | number | null; logIndex: number; data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] };

function encodedLog(
    eventName: 'MemberRegistered' | 'MemberProfileUpdated' | 'MemberWithdrawalRequested',
    args: { member: string; metadataURI?: string; deposit?: bigint },
    blockNumber: bigint | number | null,
): MockLog {
    const topics = encodeEventTopics({
        abi: MEMBERS_REGISTRY_ABI,
        eventName,
        args: { member: args.member as `0x${string}` },
    } as Parameters<typeof encodeEventTopics>[0]) as MockLog['topics'];
    // MemberWithdrawalRequested carries TWO non-indexed words (amount, releaseAt).
    const data = eventName === 'MemberWithdrawalRequested'
        ? encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [args.deposit ?? 0n, 0n])
        : encodeAbiParameters([{ type: 'string' }], [args.metadataURI ?? '']);
    return { blockNumber, logIndex: 0, data, topics };
}

function regLog(overrides?: Partial<{
    member: string; metadataURI: string; blockNumber: bigint | null;
}>): MockLog {
    return encodedLog('MemberRegistered', {
        member: overrides?.member ?? SELLER,
        metadataURI: overrides?.metadataURI ?? 'ipfs://QmProfile',
    }, overrides?.blockNumber === undefined ? 100n : overrides.blockNumber);
}

function profileUpdatedLog(overrides?: Partial<{
    member: string; metadataURI: string; blockNumber: bigint;
}>): MockLog {
    return encodedLog('MemberProfileUpdated', {
        member: overrides?.member ?? SELLER,
        metadataURI: overrides?.metadataURI ?? 'ipfs://QmProfileV2',
    }, overrides?.blockNumber ?? 200n);
}

function withdrawLog(member = SELLER, blockNumber: bigint = 500n): MockLog {
    return encodedLog('MemberWithdrawalRequested', { member, deposit: 0n }, blockNumber);
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
                case 'MemberRegistered': return Promise.resolve(events.registered ?? []);
                case 'MemberProfileUpdated': return Promise.resolve(events.profileUpdated ?? []);
                case 'MemberWithdrawalRequested': return Promise.resolve(events.withdrawn ?? []);
                default: return Promise.resolve([]);
            }
        },
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getMemberState', () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
    });

    it('returns null for a seller that has never registered', async () => {
        mockEvents({ registered: [] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).toBeNull();
    });

    it('returns the registered profile for a freshly registered seller', async () => {
        mockEvents({ registered: [regLog()] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

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

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

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
            withdrawn: [withdrawLog(SELLER, 500n)],
        });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmFresh');
    });

    it('returns null once the member REQUESTS withdrawal — not only once paid', async () => {
        // De-surfacing is the request. The claim can be a whole cooldown later,
        // and reading liveness off it would keep a departed member surfaced —
        // and reported as RPGF-eligible — for that entire window.
        mockEvents({ registered: [regLog()], withdrawn: [withdrawLog()] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).toBeNull();
    });

    it('returns the new profile after leave + re-register cycle', async () => {
        mockEvents({
            registered: [
                regLog({ blockNumber: 100n, metadataURI: 'ipfs://QmFirst' }),
                regLog({ blockNumber: 600n, metadataURI: 'ipfs://QmSecond' }),
            ],
            withdrawn: [withdrawLog(SELLER, 500n)],
        });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmSecond');
        expect(result!.registeredBlock).toBe(600n);
    });

    it('uses the registration metadataURI when no ProfileUpdated event exists', async () => {
        mockEvents({ registered: [regLog({ metadataURI: 'ipfs://QmOriginal' })] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result!.metadataURI).toBe('ipfs://QmOriginal');
    });

    it('is case-insensitive for the seller address lookup', async () => {
        mockEvents({ registered: [regLog({ member: SELLER.toLowerCase() })] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER.toUpperCase());

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
    });

    it('returns null when the registration belongs to a different seller', async () => {
        const OTHER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        mockEvents({ registered: [regLog({ member: OTHER })] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).toBeNull();
    });

    it('handles a number blockNumber in the registration log', async () => {
        const log = encodedLog('MemberRegistered', { member: SELLER, metadataURI: 'ipfs://QmNum' }, 100);
        mockEvents({ registered: [log] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result!.registeredBlock).toBe(100n);
    });

    it('returns null registeredBlock when blockNumber is null', async () => {
        const log = encodedLog('MemberRegistered', { member: SELLER, metadataURI: 'ipfs://QmNull' }, null);
        mockEvents({ registered: [log] });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).not.toBeNull();
        expect(result!.registeredBlock).toBeNull();
    });

    it('ignores withdraw events for other sellers', async () => {
        const OTHER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        mockEvents({
            registered: [regLog()],
            withdrawn: [withdrawLog(OTHER, 500n)],
        });

        const result = await getMemberState(CLIENT, CHAIN_ID, SELLER);

        expect(result).not.toBeNull();
        expect(result!.metadataURI).toBe('ipfs://QmProfile');
    });
});
