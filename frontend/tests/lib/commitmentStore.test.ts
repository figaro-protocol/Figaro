import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildResolutionCommitments,
    saveCommitment,
    loadCommitment,
    loadCommitments,
    deleteCommitment,
    listStoredCommitments,
} from '@/lib/console/commitmentStore';
import type { Commitment, Hex } from '@figaro/core';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ORDER_HASH_1 = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
const ORDER_HASH_2 = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;

const COMMITMENT_1: Commitment = {
    processId: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    buyer: '0x1234567890123456789012345678901234567890' as Hex,
    seller: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex,
    currency: '0x0000000000000000000000000000000000000001' as Hex,
    payment: 1000000000000000000n, // 1e18
    expectedCumulativeValue: 1000000000000000000n,
    agreementHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
    salt: 42n,
    deadline: 9999999999n,
};

const COMMITMENT_2: Commitment = {
    ...COMMITMENT_1,
    payment: 2000000000000000000n, // 2e18
    expectedCumulativeValue: 3000000000000000000n, // 3e18 cumulative
    salt: 43n,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('commitmentStore', () => {
    beforeEach(() => {
        // Clear all commitment entries
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith('figaro:commitment:')) {
                localStorage.removeItem(key);
            }
        }
    });

    it('save and load round-trips a commitment', () => {
        saveCommitment(ORDER_HASH_1, COMMITMENT_1);
        const loaded = loadCommitment(ORDER_HASH_1);

        expect(loaded).not.toBeNull();
        expect(loaded!.processId).toBe(COMMITMENT_1.processId);
        expect(loaded!.buyer).toBe(COMMITMENT_1.buyer);
        expect(loaded!.seller).toBe(COMMITMENT_1.seller);
        expect(loaded!.currency).toBe(COMMITMENT_1.currency);
        expect(loaded!.payment).toBe(COMMITMENT_1.payment);
        expect(loaded!.expectedCumulativeValue).toBe(COMMITMENT_1.expectedCumulativeValue);
        expect(loaded!.agreementHash).toBe(COMMITMENT_1.agreementHash);
        expect(loaded!.salt).toBe(COMMITMENT_1.salt);
        expect(loaded!.deadline).toBe(COMMITMENT_1.deadline);
    });

    it('returns null for non-existent order hash', () => {
        expect(loadCommitment(ORDER_HASH_1)).toBeNull();
    });

    it('loads multiple commitments at once', () => {
        saveCommitment(ORDER_HASH_1, COMMITMENT_1);
        saveCommitment(ORDER_HASH_2, COMMITMENT_2);

        const map = loadCommitments([ORDER_HASH_1, ORDER_HASH_2]);
        expect(map.size).toBe(2);
        expect(map.get(ORDER_HASH_1)!.payment).toBe(COMMITMENT_1.payment);
        expect(map.get(ORDER_HASH_2)!.payment).toBe(COMMITMENT_2.payment);
    });

    it('loadCommitments skips missing hashes', () => {
        saveCommitment(ORDER_HASH_1, COMMITMENT_1);
        const missing = '0x0000000000000000000000000000000000000000000000000000000000000099' as Hex;

        const map = loadCommitments([ORDER_HASH_1, missing]);
        expect(map.size).toBe(1);
        expect(map.has(ORDER_HASH_1)).toBe(true);
    });

    it('deletes a commitment', () => {
        saveCommitment(ORDER_HASH_1, COMMITMENT_1);
        expect(loadCommitment(ORDER_HASH_1)).not.toBeNull();

        deleteCommitment(ORDER_HASH_1);
        expect(loadCommitment(ORDER_HASH_1)).toBeNull();
    });

    it('lists all stored commitment hashes', () => {
        saveCommitment(ORDER_HASH_1, COMMITMENT_1);
        saveCommitment(ORDER_HASH_2, COMMITMENT_2);

        const hashes = listStoredCommitments();
        expect(hashes).toHaveLength(2);
        expect(hashes).toContain(ORDER_HASH_1);
        expect(hashes).toContain(ORDER_HASH_2);
    });

    it('handles corrupted localStorage gracefully', () => {
        localStorage.setItem('figaro:commitment:' + ORDER_HASH_1, 'not-valid-json{{{');
        expect(loadCommitment(ORDER_HASH_1)).toBeNull();
    });

    it('preserves bigint precision through round-trip', () => {
        const bigCommitment: Commitment = {
            ...COMMITMENT_1,
            payment: 123456789012345678901234567890n,
            salt: 999999999999999999999999999999n,
        };
        saveCommitment(ORDER_HASH_1, bigCommitment);

        const loaded = loadCommitment(ORDER_HASH_1)!;
        expect(loaded.payment).toBe(123456789012345678901234567890n);
        expect(loaded.salt).toBe(999999999999999999999999999999n);
    });

    it('builds resolution commitments from store-backed orders keyed by id', () => {
        const commitments = buildResolutionCommitments([
            {
                id: ORDER_HASH_1,
                processId: COMMITMENT_1.processId,
                buyer: COMMITMENT_1.buyer,
                seller: COMMITMENT_1.seller,
                currency: COMMITMENT_1.currency,
                payment: COMMITMENT_1.payment,
                cumulativeValue: COMMITMENT_1.expectedCumulativeValue,
                agreementHash: COMMITMENT_1.agreementHash,
                salt: COMMITMENT_1.salt,
                deadline: COMMITMENT_1.deadline,
            },
        ]);

        expect(commitments).toEqual([COMMITMENT_1]);
        expect(loadCommitment(ORDER_HASH_1)).toEqual(COMMITMENT_1);
    });

    it('builds resolution commitments from graph-backed orders keyed by orderHash', () => {
        const commitments = buildResolutionCommitments([
            {
                orderHash: ORDER_HASH_2,
                processId: COMMITMENT_2.processId,
                buyer: COMMITMENT_2.buyer,
                seller: COMMITMENT_2.seller,
                currency: COMMITMENT_2.currency,
                payment: COMMITMENT_2.payment,
                cumulativeValue: COMMITMENT_2.expectedCumulativeValue,
                agreementHash: COMMITMENT_2.agreementHash,
                salt: COMMITMENT_2.salt,
                deadline: COMMITMENT_2.deadline,
            },
        ]);

        expect(commitments).toEqual([COMMITMENT_2]);
        expect(loadCommitment(ORDER_HASH_2)).toEqual(COMMITMENT_2);
    });
});
