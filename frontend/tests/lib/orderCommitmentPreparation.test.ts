import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const agreementStoreMocks = vi.hoisted(() => ({
    saveAgreement: vi.fn(),
    publishAgreement: vi.fn(),
}));

vi.mock('@/lib/core/agreementStore', () => ({
    saveAgreement: agreementStoreMocks.saveAgreement,
    publishAgreement: agreementStoreMocks.publishAgreement,
}));

import {
    buildUnsignedOrderCommitment,
    persistAgreementArtifact,
    prepareOrderCommitment,
} from '@/lib/core/orderCommitmentPreparation';
import { ZERO_PROCESS_ID } from '@/lib/shared/evm';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { primeClauseSpecs } from './primeClauseSpecs';

// The agreement build composes structural sections from the chain-fed spec
// cache — prime it with the canonical Layer-A specs.
beforeAll(async () => {
    await primeClauseSpecs();
});

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`;
const AGREEMENT_HASH = ('0x' + '11'.repeat(32)) as `0x${string}`;

describe('orderCommitmentPreparation', () => {
    beforeEach(() => {
        agreementStoreMocks.saveAgreement.mockReset();
        agreementStoreMocks.publishAgreement.mockReset();
        agreementStoreMocks.saveAgreement.mockReturnValue(AGREEMENT_HASH);
    });

    it('builds unsigned root commitments with shared defaults', () => {
        const commitment = buildUnsignedOrderCommitment({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 25n,
            agreementHash: AGREEMENT_HASH,
        });

        expect(commitment.processId).toBe(ZERO_PROCESS_ID);
        expect(commitment.expectedCumulativeValue).toBe(25n);
        expect(commitment.agreementHash).toBe(AGREEMENT_HASH);
        // Salt is a crypto-random 256-bit value; deadline is a future timestamp.
        expect(commitment.salt).toBeGreaterThan(0n);
        expect(commitment.deadline).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
    });

    it('returns URI-backed commitment metadata when agreement publication succeeds', async () => {
        agreementStoreMocks.publishAgreement.mockResolvedValue({
            agreementHash: AGREEMENT_HASH,
            cid: 'bafytest',
            uri: 'ipfs://bafytest',
        });

        const prepared = await prepareOrderCommitment({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
        });

        expect(agreementStoreMocks.saveAgreement).toHaveBeenCalledTimes(1);
        expect(agreementStoreMocks.publishAgreement).toHaveBeenCalledTimes(1);
        expect(prepared.agreementHash).toBe(AGREEMENT_HASH);
        expect(prepared.commitment.agreementHash).toBe(AGREEMENT_HASH);
        expect(prepared.commitmentMeta).toEqual({ agreementUri: 'ipfs://bafytest' });
    });

    it('falls back to inline agreement metadata when publication fails', async () => {
        agreementStoreMocks.publishAgreement.mockRejectedValue(new Error('ipfs unavailable'));

        const prepared = await prepareOrderCommitment({
            processId: ('0x' + '22'.repeat(32)) as `0x${string}`,
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            expectedCumulativeValue: 15n,
            parentOrderHashes: [('0x' + '33'.repeat(32)) as `0x${string}`],
        });

        expect(prepared.commitment.processId).toBe('0x' + '22'.repeat(32));
        expect(prepared.commitment.expectedCumulativeValue).toBe(15n);
        expect(prepared.commitmentMeta).toEqual({ agreement: prepared.agreement });
    });

    it('persists a prebuilt agreement artifact directly', async () => {
        agreementStoreMocks.publishAgreement.mockResolvedValue({
            agreementHash: AGREEMENT_HASH,
            cid: 'bafytest',
            uri: 'ipfs://bafytest',
        });

        const prepared = await persistAgreementArtifact({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            version: 1 as any,
            buyer: BUYER,
            seller: SELLER,
            sections: [],
        });

        expect(prepared.agreementHash).toBe(AGREEMENT_HASH);
        expect(prepared.commitmentMeta).toEqual({ agreementUri: 'ipfs://bafytest' });
    });
});