import { describe, expect, it } from 'vitest';
import { ConsoleQueue } from '@/lib/console/consoleQueue';
import { resolveSemanticRuntimeSnapshotForSubjectAddress } from '@/lib/shared/runtimeResolution';
import type { ProposedAction } from '@figaro/core/agent';
import type { RegisterSchemaAction, PublishAssemblyAction } from '@/lib/console/buildProvider';

// ── Fixtures ────────────────────────────────────────────────────────────────

const PROCESS_ID = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
const ADDRESS = '0x1234567890123456789012345678901234567890' as const;
const BOUND_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

function makeOperatingAction(overrides?: Partial<ProposedAction>): ProposedAction {
    return {
        type: 'resolve-process',
        description: 'Resolve process',
        processId: PROCESS_ID,
        caller: ADDRESS,
        commitments: [],
        settlements: [],
        totalBuyerPayout: 0n,
        totalSellerPayout: 0n,
        ...overrides,
    } as ProposedAction;
}

function makeRegisterSchemaAction(): RegisterSchemaAction {
    return {
        type: 'register-schema',
        description: 'Register schema on-chain',
        slug: 'test-assembly',
        schemaKey: 'figaro:assembly:test',
        version: 1,
    };
}

function makePublishAction(): PublishAssemblyAction {
    return {
        type: 'publish-assembly',
        description: 'Publish assembly',
        slug: 'test-assembly',
        assembly: { identity: { slug: 'test-assembly' } } as any,
    };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ConsoleQueue', () => {
    it('starts empty', () => {
        const q = new ConsoleQueue();
        expect(q.all()).toEqual([]);
        expect(q.pendingCount).toBe(0);
    });

    it('enqueues operating actions with incrementing IDs', () => {
        const q = new ConsoleQueue();
        const id1 = q.enqueueOperating(makeOperatingAction());
        const id2 = q.enqueueOperating(makeOperatingAction({ description: 'Second' }));

        expect(id1).toBe(1);
        expect(id2).toBe(2);
        expect(q.all()).toHaveLength(2);
        expect(q.all()[0].entry.kind).toBe('operating');
        expect(q.pendingCount).toBe(2);
    });

    it('stores a resolved runtime snapshot on operating queue items when provided', () => {
        const q = new ConsoleQueue();
        const runtimeSnapshot = resolveSemanticRuntimeSnapshotForSubjectAddress(BOUND_ADDRESS);
        const id = q.enqueueOperating(makeOperatingAction(), { runtimeSnapshot });

        expect(q.get(id)?.runtimeSnapshot?.assembly.identity.slug).toBe('figaro-eats');
        expect(q.get(id)?.runtimeSnapshot?.runtime.selectedBindingId).toBe('binding:bobs-pizza-palace:local-anvil');
    });

    it('enqueues building actions', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueBuilding(makeRegisterSchemaAction());

        expect(id).toBe(1);
        const item = q.get(id)!;
        expect(item.entry.kind).toBe('building');
        expect(item.entry.action.type).toBe('register-schema');
        expect(item.status).toBe('pending');
    });

    it('mixes operating and building actions in the same queue', () => {
        const q = new ConsoleQueue();
        q.enqueueOperating(makeOperatingAction());
        q.enqueueBuilding(makeRegisterSchemaAction());
        q.enqueueBuilding(makePublishAction());
        q.enqueueOperating(makeOperatingAction({ description: 'Another' }));

        const items = q.all();
        expect(items).toHaveLength(4);
        expect(items.map((i) => i.entry.kind)).toEqual([
            'operating', 'building', 'building', 'operating',
        ]);
        expect(q.pendingCount).toBe(4);
    });

    // ── Approve ─────────────────────────────────────────────────────────────

    it('approves a pending item', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueBuilding(makeRegisterSchemaAction());
        const item = q.approve(id);

        expect(item.status).toBe('approved');
        expect(item.decidedAt).toBeGreaterThan(0);
        expect(q.pendingCount).toBe(0);
    });

    it('throws when approving a non-existent item', () => {
        const q = new ConsoleQueue();
        expect(() => q.approve(999)).toThrow('Queue item 999 not found');
    });

    it('throws when approving an already-approved item', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        q.approve(id);
        expect(() => q.approve(id)).toThrow('is approved, not pending');
    });

    // ── Reject ──────────────────────────────────────────────────────────────

    it('rejects a pending item with a reason', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        const item = q.reject(id, 'Not now');

        expect(item.status).toBe('rejected');
        expect(item.rejectionReason).toBe('Not now');
        expect(item.decidedAt).toBeGreaterThan(0);
    });

    it('rejects without a reason', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueBuilding(makePublishAction());
        const item = q.reject(id);

        expect(item.status).toBe('rejected');
        expect(item.rejectionReason).toBeUndefined();
    });

    it('throws when rejecting a non-pending item', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        q.reject(id);
        expect(() => q.reject(id)).toThrow('is rejected, not pending');
    });

    // ── Execute ─────────────────────────────────────────────────────────────

    it('marks an approved item as executed with txHash', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        q.approve(id);
        q.markExecuted(id, '0xabc123');

        const item = q.get(id)!;
        expect(item.status).toBe('executed');
        expect(item.txHash).toBe('0xabc123');
    });

    it('marks an approved building action as executed with result', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueBuilding(makePublishAction());
        q.approve(id);
        q.markExecuted(id, undefined, { published: true, slug: 'test-assembly' });

        const item = q.get(id)!;
        expect(item.status).toBe('executed');
        expect(item.txHash).toBeUndefined();
        expect(item.result).toEqual({ published: true, slug: 'test-assembly' });
    });

    it('marks an approved item as forwarded with an interactive result', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction({ type: 'commit-sub-order' }));
        q.approve(id);
        q.markForwarded(id, { routedTo: 'create-order', processId: PROCESS_ID });

        const item = q.get(id)!;
        expect(item.status).toBe('forwarded');
        expect(item.txHash).toBeUndefined();
        expect(item.result).toEqual({ routedTo: 'create-order', processId: PROCESS_ID });
    });

    it('throws when executing a pending item (must approve first)', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        expect(() => q.markExecuted(id)).toThrow('is pending, not approved');
    });

    it('throws when executing a rejected item', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        q.reject(id);
        expect(() => q.markExecuted(id)).toThrow('is rejected, not approved');
    });

    it('throws when forwarding a rejected item', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueOperating(makeOperatingAction());
        q.reject(id);
        expect(() => q.markForwarded(id)).toThrow('is rejected, not approved');
    });

    it('throws when executing a non-existent item', () => {
        const q = new ConsoleQueue();
        expect(() => q.markExecuted(42)).toThrow('Queue item 42 not found');
    });

    // ── all() returns a snapshot ────────────────────────────────────────────

    it('all() returns a copy, not the internal array', () => {
        const q = new ConsoleQueue();
        q.enqueueOperating(makeOperatingAction());
        const snapshot = q.all();
        snapshot.push(undefined as any);
        expect(q.all()).toHaveLength(1);
    });

    // ── Full lifecycle ──────────────────────────────────────────────────────

    it('full lifecycle: enqueue → approve → execute', () => {
        const q = new ConsoleQueue();
        const id = q.enqueueBuilding(makeRegisterSchemaAction());

        expect(q.get(id)!.status).toBe('pending');

        q.approve(id);
        expect(q.get(id)!.status).toBe('approved');

        q.markExecuted(id, '0xdeadbeef');
        expect(q.get(id)!.status).toBe('executed');
        expect(q.get(id)!.txHash).toBe('0xdeadbeef');
    });

    it('mixed lifecycle: approve one, reject another', () => {
        const q = new ConsoleQueue();
        const id1 = q.enqueueOperating(makeOperatingAction());
        const id2 = q.enqueueBuilding(makePublishAction());

        q.approve(id1);
        q.reject(id2, 'Not ready');

        expect(q.get(id1)!.status).toBe('approved');
        expect(q.get(id2)!.status).toBe('rejected');
        expect(q.pendingCount).toBe(0);
    });
});
