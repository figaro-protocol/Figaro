/**
 * @figaro/sdk — Bond Calculator
 *
 * Pure functions for the 2× asymmetric bonding math.
 * No chain access needed — just arithmetic.
 */

import type { BondBreakdown, SettlementBreakdown } from "./types.js";

/**
 * Calculate the required bonds for an order.
 *
 * Invariants (FigaroCore):
 *   sellerBond = 2 × cumulativeValue
 *   buyerBond  = 2 × payment
 */
export function calculateBonds(cumulativeValue: bigint, payment: bigint): BondBreakdown {
    return {
        sellerBond: cumulativeValue * 2n,
        buyerBond: payment * 2n,
        totalLocked: cumulativeValue * 2n + payment * 2n,
    };
}

/**
 * Calculate settlement payouts after resolveProcess.
 *
 * At resolution:
 *   sellerPayout = payment + sellerBond
 *   buyerPayout  = buyerBond − payment
 *
 * This means:
 *   - Seller gets their bond back + the payment
 *   - Buyer gets their bond back minus the payment (which went to seller)
 *   - Net transfer: exactly `payment` flows from buyer to seller
 */
export function calculateSettlement(
    payment: bigint,
    sellerBond: bigint,
    buyerBond: bigint,
): SettlementBreakdown {
    return {
        sellerPayout: payment + sellerBond,
        buyerPayout: buyerBond - payment,
        netTransfer: payment,
    };
}

/**
 * How much ERC-20 token approval the party needs before committing.
 *
 * For root orders:
 *   Buyer must approve:  2 × payment
 *   Seller must approve: 2 × payment  (= 2 × cumulativeValue when cumulativeValue == payment)
 *
 * For sub-orders:
 *   Seller must approve: 2 × newCumulativeValue − previousSellerBond
 *   Buyer:  0  (already bonded via root order)
 *
 * This function handles the root-order case. Sub-order incremental
 * approval depends on process state — use `calculateSubOrderSellerApproval`.
 */
export function calculateRootApproval(payment: bigint): {
    buyerApproval: bigint;
    sellerApproval: bigint;
} {
    return {
        buyerApproval: payment * 2n,
        sellerApproval: payment * 2n,
    };
}

/**
 * Calculate the incremental seller bond needed for a sub-order.
 *
 * When a sub-order is committed, the seller's bond increases to 2× the
 * new cumulative value. The increment is the difference.
 */
export function calculateSubOrderSellerApproval(
    newCumulativeValue: bigint,
    currentCumulativeValue: bigint,
): bigint {
    const increment = newCumulativeValue - currentCumulativeValue;
    return increment * 2n;
}

/**
 * Verify that a bond configuration satisfies the protocol invariants.
 * Useful for agents to validate before signing.
 */
export function validateBonds(
    payment: bigint,
    cumulativeValue: bigint,
    sellerBond: bigint,
    buyerBond: bigint,
): { valid: boolean; reason?: string } {
    if (payment <= 0n) {
        return { valid: false, reason: "payment must be positive" };
    }
    if (cumulativeValue < payment) {
        return { valid: false, reason: "cumulativeValue must be >= payment" };
    }
    if (sellerBond !== cumulativeValue * 2n) {
        return { valid: false, reason: `sellerBond must be 2 × cumulativeValue (expected ${cumulativeValue * 2n}, got ${sellerBond})` };
    }
    if (buyerBond !== payment * 2n) {
        return { valid: false, reason: `buyerBond must be 2 × payment (expected ${payment * 2n}, got ${buyerBond})` };
    }
    return { valid: true };
}
