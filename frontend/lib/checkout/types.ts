/**
 * Commerce service types — the abstraction boundary between UI and chain.
 *
 * Components consume `useCommerce()` for identity and `useCheckout(token)` for
 * the full checkout lifecycle. Nothing downstream of these hooks imports from
 * wagmi directly.
 */

import type { OrderPreview } from "@/lib/checkout/orderPreview";
import type { CommitmentPayload } from "@/lib/kernel/signedCommitment";
import type { OrderFlowStep } from "@/lib/checkout/orderCommitmentFlow";

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
    step: OrderFlowStep;
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

    // Order placement — the buyer signs each previewed order through the SAME
    // confirm gate the seller's accept uses (no checkout-only bypass):
    //   signRoot:     signs the root and surfaces its payload to the share
    //                 panel; the buyer relays it (XMTP / QR / copy) from there.
    //   signAndShare: signs + relays a sub-order to its bound seller in one step.
    signRoot: (preview: OrderPreview) => Promise<CommitmentPayload>;
    signAndShare: (preview: OrderPreview) => Promise<CommitmentPayload>;

    // Order status
    order: OrderFlowState;
    resetOrder: () => void;
}
