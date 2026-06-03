/**
 * Commerce service types — the abstraction boundary between UI and chain.
 *
 * Components consume `useCommerce()` for identity and `useCheckout(token)` for
 * the full checkout lifecycle. Nothing downstream of these hooks imports from
 * wagmi directly.
 */

import type { Commitment } from "@figaro/core";
import type { CommitmentPayload, CommitmentPayloadMeta, CommitmentFlowStep } from "@/lib/core/useCommitmentFlow";
import type { PartyRole } from "@/lib/core/walletProcessQueries";

// ── Identity ────────────────────────────────────────────────────

export interface CommerceIdentity {
    address: `0x${string}` | undefined;
    isConnected: boolean;
    chainId: number;
}

// ── Token state ─────────────────────────────────────────────────

interface TokenState {
    balance: bigint | undefined;
    decimals: number;
}

// ── Authorization (ERC-20 approve) ──────────────────────────────

interface AuthorizationState {
    isPending: boolean;
    isConfirming: boolean;
    isSuccess: boolean;
}

// ── Order flow ──────────────────────────────────────────────────

interface OrderFlowState {
    step: CommitmentFlowStep;
    error: string | null;
    payload: CommitmentPayload | null;
}

// ── useCheckout return type ─────────────────────────────────────

export interface CheckoutHandle {
    // Token state
    balance: bigint | undefined;
    decimals: number;

    // Authorization
    needsAuthorization: (amount: bigint) => boolean;
    authorize: (amount: bigint) => void;
    authorization: AuthorizationState;

    // Order placement — two modes:
    //   signAndPlace: signs both sides + submits (devnet / same-wallet)
    //   initiateAsParty: signs one side, returns payload for counter-signing
    signAndPlace: (commitment: Commitment, meta?: CommitmentPayloadMeta, initiatorRole?: PartyRole) => Promise<`0x${string}` | undefined>;
    initiateAsParty: (commitment: Commitment, role: PartyRole, meta?: CommitmentPayloadMeta) => Promise<CommitmentPayload>;
    broadcast: (payload: CommitmentPayload) => Promise<`0x${string}` | undefined>;

    // Order status
    order: OrderFlowState;
    resetOrder: () => void;
}
