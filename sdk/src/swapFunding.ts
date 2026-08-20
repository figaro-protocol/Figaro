/**
 * @figaro-protocol/sdk — swap-funded bond legs (WitnessSwapAndCommitCoordinator)
 *
 * A party who does not hold the process bond currency funds their bond from a
 * token they do hold: the coordinator pulls the input token via a Permit2
 * WITNESS signature, swaps it through an immutable venue, forwards the
 * proceeds to the party's EOA, then calls `FigaroCore.commit` — the kernel
 * pulls the bond from the party as always, so the bilateral commitment is
 * untouched and the coordinator is never a counterparty.
 *
 * The witness binds `{router, inputToken, maxInput, keccak256(swapData)}` into
 * the digest the party signs, so a relayer cannot substitute the swap route.
 * This module is the off-chain half of that convention: the funding-leg wire
 * type and the EIP-712 typed data whose hash equals the digest Permit2
 * verifies (`swapWitness` on the coordinator recomputes the same witness
 * on-chain; the mainnet-fork Foundry suite proves the convention against the
 * canonical Permit2 deployment).
 */
import { keccak256, type TypedDataDomain } from "viem";
import type { Hex } from "./types.js";

/** One funding leg of `swapAndCommit` — mirrors the coordinator's
 *  `SwapFunding` struct. `enabled = false` skips the leg (the party
 *  self-funds the bond currency, exactly as in the plain kernel flow). */
export interface SwapFundingLeg {
    enabled: boolean;
    inputToken: Hex;
    maxInput: bigint;
    permitNonce: bigint;
    permitDeadline: bigint;
    permitSignature: Hex;
    swapData: Hex;
}

/** The disabled leg — all fields inert; the coordinator never reads them. */
export const DISABLED_SWAP_FUNDING_LEG: SwapFundingLeg = {
    enabled: false,
    inputToken: "0x0000000000000000000000000000000000000000",
    maxInput: 0n,
    permitNonce: 0n,
    permitDeadline: 0n,
    permitSignature: "0x",
    swapData: "0x",
};

/** The funding leg's bigint field names — one list shared by the payload
 *  serializer/deserializer so the wire format has a single definition. */
export const SWAP_FUNDING_BIGINT_FIELDS = ["maxInput", "permitNonce", "permitDeadline"] as const;

/** EIP-712 types for Permit2's `PermitWitnessTransferFrom` carrying the
 *  coordinator's `SwapWitness`. Field order matches Permit2's stub exactly
 *  (witness member last); EIP-712's alphabetical sub-type ordering reproduces
 *  the coordinator's `WITNESS_TYPE_STRING` (SwapWitness before
 *  TokenPermissions). */
export const SWAP_WITNESS_PERMIT_TYPES = {
    PermitWitnessTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "witness", type: "SwapWitness" },
    ],
    SwapWitness: [
        { name: "router", type: "address" },
        { name: "inputToken", type: "address" },
        { name: "maxInput", type: "uint256" },
        { name: "swapDataHash", type: "bytes32" },
    ],
    TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
    ],
} as const;

export interface SwapWitnessTypedDataArgs {
    /** Chain the Permit2 deployment lives on. */
    chainId: number;
    /** The Permit2 contract verifying the signature (canonical on mainnet,
     *  the witness-verifying mock on devnet). */
    permit2: Hex;
    /** The coordinator — Permit2's `spender` (it performs the pull). */
    coordinator: Hex;
    /** The coordinator's immutable swap venue. */
    router: Hex;
    inputToken: Hex;
    maxInput: bigint;
    /** Unordered Permit2 nonce — any never-used uint256 for this owner. */
    nonce: bigint;
    deadline: bigint;
    /** The exact swap calldata the venue will receive — route-bound. */
    swapData: Hex;
}

/** Build the EIP-712 typed data a party signs to authorize one swap-funded
 *  bond leg. Pass directly to `signTypedData`; `hashTypedData` of this value
 *  equals the digest Permit2 recomputes on-chain. Permit2's domain carries no
 *  `version` field — do not add one. */
export function buildSwapWitnessTypedData(args: SwapWitnessTypedDataArgs) {
    return {
        domain: {
            name: "Permit2",
            chainId: args.chainId,
            verifyingContract: args.permit2,
        } satisfies TypedDataDomain,
        types: SWAP_WITNESS_PERMIT_TYPES,
        primaryType: "PermitWitnessTransferFrom" as const,
        message: {
            permitted: { token: args.inputToken, amount: args.maxInput },
            spender: args.coordinator,
            nonce: args.nonce,
            deadline: args.deadline,
            witness: {
                router: args.router,
                inputToken: args.inputToken,
                maxInput: args.maxInput,
                swapDataHash: keccak256(args.swapData),
            },
        },
    } as const;
}
