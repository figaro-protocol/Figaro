/**
 * Vocabulary layer — the single source of truth for user-facing terminology.
 *
 * Protocol terms leak into the UI as "bond", "commit", "resolve", "approve",
 * "attestation", etc. This dictionary translates them into commerce language
 * that non-crypto users understand. When the team decides to change "deposit"
 * to "guarantee" everywhere, one edit here propagates to every surface.
 *
 * Usage:
 *   import { vocab } from "@/lib/shared/vocab";
 *   <h2>{vocab.headings.depositSummary}</h2>
 *   <button>{vocab.buttons.placeOrder}</button>
 *   <span>{vocab.status.committed}</span>
 *   <p>{vocab.progress.signing}</p>
 *   <p>{vocab.errors.authorizationFailed}</p>
 *   <span>{vocab.term("bond")}</span>           // → "deposit"
 *   <span>{vocab.progress.authorizing}</span>    // → "Authorizing payment…"
 */

// ── Protocol → Commerce term map ────────────────────────────────

const TERM_MAP: Record<string, string> = {
    bond: "deposit",
    "buyer bond": "your deposit",
    "seller bond": "their deposit",
    commit: "place",
    commitment: "order",
    resolve: "complete",
    resolved: "completed",
    approve: "authorize",
    approval: "authorization",
    allowance: "authorization",
    attestation: "verification",
    settlement: "completion",
    collateral: "deposit",
    process: "order group",
    "process id": "order group",
    token: "payment",
    "token approval": "payment authorization",
};

// ── Exported vocabulary ─────────────────────────────────────────

export const vocab = {
    /**
     * Translate a protocol term to its commerce equivalent.
     * Returns the input unchanged if no translation exists.
     */
    term: (protocol: string): string =>
        TERM_MAP[protocol.toLowerCase()] ?? protocol,

    /** Button labels */
    buttons: {
        placeOrder: "Place Order",
        addToOrder: "Add to Order",
        authorize: "Authorize Payment",
        authorizeAmount: (amount: string) => `Authorize ${amount}`,
        completeDelivery: "Complete Delivery",
        confirm: "Confirm",
        cancel: "Cancel",
        withdrawDeposit: "Withdraw Deposit",
        submitProof: "Submit Proof",
        claimJob: "Claim Job",
    },

    /** Status labels (event timeline, order cards, etc.) */
    status: {
        idle: "Ready",
        committed: "Placed",
        active: "Active",
        resolved: "Completed",
        error: "Failed",
        signing: "Signing",
        broadcasting: "Submitting",
        approving: "Authorizing",
        placed: "Placed",
        completed: "Completed",
    },

    /** Section / panel headings */
    headings: {
        depositSummary: "Deposit Summary",
        depositCalculator: "Deposit Calculator",
        depositAndPayment: "Deposit & Payment",
        orderSummary: "Order Summary",
        payoutBreakdown: "Payout Breakdown",
        payoutDetails: "Payout Details",
        orderTimeline: "Order Timeline",
        verificationHistory: "Verification History",
        pickupConfirmation: "Pickup Confirmation",
        deliveryConfirmation: "Delivery Confirmation",
        disclosureHistory: "Disclosure History",
        registrationDeposit: "Registration Deposit",
    },

    /** Progress messages shown during async operations */
    progress: {
        signing: "Signing… (check wallet)",
        authorizing: "Authorizing payment…",
        confirmingAuthorization: "Confirming authorization…",
        placingOrder: "Placing order…",
        submitting: "Submitting…",
        preparing: "Preparing order…",
        loading: "Loading…",
    },

    /** Error messages */
    errors: {
        authorizationFailed: "Authorization failed",
        orderFailed: "Failed to place order",
        signingFailed: "Signing failed",
        insufficientFunds: "Insufficient funds",
        insufficientFundsDetail: (required: string, available: string) =>
            `Insufficient funds. Required: ${required}, Available: ${available}`,
        signInFirst: "Please sign in first",
        verificationFailed: "Verification failed",
    },

    /** Info / explainer copy */
    info: {
        howDepositWorks: "How the deposit works",
        depositExplainerBullets: [
            "You place a refundable deposit (2× the payment amount)",
            "The seller places a matching deposit as their guarantee",
            "Once both deposits are in, the order proceeds",
            "When you confirm delivery, deposits are returned and the seller is paid",
        ] as readonly string[],
        keyLossWarning:
            "Your deposit is held securely with no admin backdoor. If you lose access to your account, your funds cannot be recovered. Consider using account recovery if this is a concern.",
        depositExplainerShort:
            "Both sides place a refundable deposit as a guarantee. Deposits are returned when the order completes.",
    },

    /** Label pairs for order detail rows */
    labels: {
        payment: "Payment",
        securityDeposit: "Security deposit (2×)",
        sellerDeposit: "Seller Deposit",
        buyerDeposit: "Buyer Deposit",
        totalDeposits: "Total Deposits",
        totalHeld: "Total held until delivery",
        seller: "Seller",
        buyer: "Buyer",
        currency: "Payment currency",
        currencyAddress: "Payment currency address",
        authorized: "Authorized ✓",
        authorizationNeeded: "Authorization needed",
    },
} as const;
