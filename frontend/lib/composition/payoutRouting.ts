/**
 * payoutRouting — the fiscal limb of post-settlement composition: one
 * payment in, many earmarked recipients out, one transaction.
 *
 * The settled seller splits its OWN receipts onward through a public
 * multisender (fifth-noun composition — mainnet composes the canonical
 * ownerless Disperse deployment; devnet rehearses against MockDisperse,
 * which mirrors its verified interface). Wallet-side and post-settlement by
 * design: the kernel has already paid out, so this is a wallet spending its
 * own balance — no batch-path work, no process state, no new contract. The
 * self-sovereign fiscal trail (which address got which share of which
 * receipt) falls out of the chain record as a byproduct.
 *
 * This module is the PURE half: the composed contract's ABI and the leg
 * vocabulary + validation. The broadcast lives in
 * `usePayoutRoutingActions`; the surface in
 * `components/runtime/PayoutRoutingPanel.tsx`.
 */
import { isValidAddress } from "@/lib/shared/evm";

/** The verified Disperse interface (0xD152f5…2150, same address across 16
 *  chains; MockDisperse mirrors it on devnet). A composed third-party ABI —
 *  not a kernel ABI, so it lives with the composition, not `lib/kernel`. */
export const DISPERSE_ABI = [
    {
        type: "function",
        name: "disperseToken",
        stateMutability: "nonpayable",
        inputs: [
            { name: "token", type: "address" },
            { name: "recipients", type: "address[]" },
            { name: "values", type: "uint256[]" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "disperseTokenSimple",
        stateMutability: "nonpayable",
        inputs: [
            { name: "token", type: "address" },
            { name: "recipients", type: "address[]" },
            { name: "values", type: "uint256[]" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "disperseEther",
        stateMutability: "payable",
        inputs: [
            { name: "recipients", type: "address[]" },
            { name: "values", type: "uint256[]" },
        ],
        outputs: [],
    },
] as const;

/** One earmarked routing leg — a recipient and its share, in the settled
 *  order's own currency units (wei-scale bigint). */
export interface PayoutLeg {
    recipient: `0x${string}`;
    amount: bigint;
}

/** Sum of the legs — what the multisender pulls (and the approve target). */
export function payoutTotal(legs: readonly PayoutLeg[]): bigint {
    return legs.reduce((sum, leg) => sum + leg.amount, 0n);
}

/** Display-level leg validation — the wallet and the token contract stay the
 *  enforcement (an over-balance batch reverts atomically on-chain). Returns
 *  the first human-readable problem, or null when the legs are routable. */
export function validatePayoutLegs(legs: readonly PayoutLeg[]): string | null {
    if (legs.length === 0) return "Add at least one recipient.";
    for (const leg of legs) {
        if (!isValidAddress(leg.recipient)) return `Not a valid address: ${leg.recipient || "(empty)"}`;
        if (leg.amount <= 0n) return "Every leg needs an amount above zero.";
    }
    return null;
}
