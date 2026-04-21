import { describe, expect, it } from 'vitest';

import {
    describeBuildAction,
    describeOperatingAction,
    describeQueueRuntimeContext,
    buildCreateOrderPrefill,
} from '@/lib/console/actionPresentation';
import { resolveSemanticRuntimeSnapshotForSubjectAddress } from '@/lib/shared/runtimeResolution';
import type { CommitSubOrderAction, ProposedAction } from '@figaro/core/agent';
import type { RegisterSchemaAction } from '@/lib/console/buildProvider';

const PROCESS_ID = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
const ADDRESS = '0x1234567890123456789012345678901234567890' as const;
const CURRENCY = '0x2222222222222222222222222222222222222222' as const;
const BOUND_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

function makeResolveAction(): ProposedAction {
    return {
        type: 'resolve-process',
        description: 'Resolve process',
        processId: PROCESS_ID,
        caller: ADDRESS,
        commitments: [],
        settlements: [],
        totalBuyerPayout: 0n,
        totalSellerPayout: 0n,
    } as ProposedAction;
}

function makeCommitSubOrderAction(): CommitSubOrderAction {
    return {
        type: 'commit-sub-order',
        description: 'Add a sub-order',
        processId: PROCESS_ID,
        buyer: ADDRESS,
        currentCumulativeValue: 10n,
        currency: CURRENCY,
    };
}

function makeRegisterSchemaAction(): RegisterSchemaAction {
    return {
        type: 'register-schema',
        description: 'Register schema on-chain',
        slug: 'test-assembly',
        schemaKey: 'figaro:test',
        version: 1,
    };
}

describe('console action presentation', () => {
    it('describes resolve-process as a transaction action', () => {
        const presentation = describeOperatingAction(makeResolveAction());

        expect(presentation.label).toBe('Resolve Process');
        expect(presentation.executionType).toBe('transaction');
        expect(presentation.executeLabel).toBe('Execute');
    });

    it('describes commit-sub-order as an interactive action', () => {
        const presentation = describeOperatingAction(makeCommitSubOrderAction());

        expect(presentation.label).toBe('Commit Sub-Order');
        expect(presentation.executionType).toBe('interactive');
        expect(presentation.executeLabel).toBe('Open Form');
    });

    it('builds a create-order prefill from a commit-sub-order action', () => {
        const prefill = buildCreateOrderPrefill(makeCommitSubOrderAction());

        expect(prefill).toEqual({
            seller: '',
            payment: '0.01',
            currency: CURRENCY,
            agreementHash: '',
            isSubOrder: true,
            processId: PROCESS_ID,
        });
    });

    it('describes register-schema as a build action', () => {
        const presentation = describeBuildAction(makeRegisterSchemaAction());

        expect(presentation.label).toBe('Register Schema');
        expect(presentation.executionType).toBe('build');
        expect(presentation.executeLabel).toBe('Execute');
    });

    it('describes the resolved runtime context for operating queue items', () => {
        const runtimeSnapshot = resolveSemanticRuntimeSnapshotForSubjectAddress(BOUND_ADDRESS);
        const runtimeContext = describeQueueRuntimeContext({
            id: 1,
            entry: { kind: 'operating', action: makeResolveAction() },
            runtimeSnapshot,
            status: 'pending',
            enqueuedAt: Date.now(),
        });

        expect(runtimeContext).toEqual({
            summary: "Runtime: Bob's Pizza Palace · Figaro Eats · Restaurant",
            providers: 'Providers: catalogue=default-catalogue, evidenceTransport=default-ipfs, coordinationMessaging=default-coordination-messaging',
        });
    });
});