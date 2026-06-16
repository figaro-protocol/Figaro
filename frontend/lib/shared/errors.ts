import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Map a FigaroCore error name to a user-facing message. 1:1 with
 * `src/FigaroCore.sol:64-79` — keep aligned when the kernel error set
 * changes (the kernel is frozen, so changes are rare).
 */
const FIGARO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
    DeadlineExpired: "Commitment deadline has expired",
    InvalidBuyerSignature: "Invalid buyer signature on commitment",
    InvalidSellerSignature: "Invalid seller signature on commitment",
    ZeroPayment: "Payment amount must be greater than zero",
    ProcessAlreadyExists: "Process ID already exists",
    UnknownProcess: "Unknown process ID",
    CumulativeValueMismatch: "Cumulative value does not match expected total",
    NotProcessBuyer: "Only the process buyer can resolve",
    CurrencyMismatch: "Currency does not match the process",
    OrderNotCommitted: "Order has not been committed",
    NoActiveOrders: "No active orders in this process",
    IncompleteOrderList: "Resolution requires the complete list of active order IDs",
    DuplicateCommitment: "This commitment has already been submitted",
    FeeOnTransferDetected: "Fee-on-transfer tokens are not supported",
    InvalidRootCumulativeValue: "Root order cumulative value must equal its payment",
    ProcessAlreadyResolved: "Process has already been resolved",
};

type ErrorLike = {
    shortMessage?: unknown;
    message?: unknown;
};

function clamp(value: string, maxLength: number | undefined): string {
    if (maxLength && value.length > maxLength) {
        return value.slice(0, maxLength);
    }
    return value;
}

function normalize(value: unknown, maxLength: number | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return clamp(trimmed, maxLength);
}

/**
 * Convert any thrown value into a user-facing message string.
 *
 * Priority:
 *  1. Decoded contract revert (viem `ContractFunctionRevertedError`) — map
 *     the FigaroCore `errorName` via `FIGARO_ERROR_MESSAGES`; fall through
 *     to the raw `errorName` for non-FigaroCore reverts. Requires the ABI
 *     to carry the error declarations (CORE_ABI does, as of `a757375`).
 *  2. User wallet rejection — viem `BaseError` whose message contains
 *     "User rejected" / "rejected".
 *  3. viem `BaseError.shortMessage` / `Error.message` — generic last-mile
 *     extraction for mempool / RPC / gas-estimation failures viem already
 *     classifies.
 *  4. Fallback string.
 */
/**
 * Coerce an unknown caught value to an `Error`. Replaces the
 * `err instanceof Error ? err : new Error(String(err))` pattern reinvented
 * across the seller + assembly hooks.
 */
export function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

export function extractErrorMessage(
    cause: unknown,
    fallback: string,
    options?: { maxLength?: number },
): string {
    const maxLength = options?.maxLength;

    if (cause instanceof BaseError) {
        const revertError = cause.walk(
            (err) => err instanceof ContractFunctionRevertedError,
        );
        if (revertError instanceof ContractFunctionRevertedError) {
            const errorName = revertError.data?.errorName;
            if (errorName) {
                const friendly = FIGARO_ERROR_MESSAGES[errorName];
                return clamp(friendly ?? errorName, maxLength);
            }
        }

        const short = cause.shortMessage ?? "";
        const msg = cause.message ?? "";
        if (short.includes("User rejected") || msg.includes("rejected")) {
            return "Transaction was rejected";
        }

        const extracted = normalize(cause.shortMessage, maxLength)
            ?? normalize(cause.message, maxLength);
        return extracted ?? fallback;
    }

    if (cause instanceof Error) {
        const message = normalize((cause as ErrorLike).shortMessage, maxLength)
            ?? normalize(cause.message, maxLength);
        return message ?? fallback;
    }

    if (typeof cause === "object" && cause !== null) {
        const message = normalize((cause as ErrorLike).shortMessage, maxLength)
            ?? normalize((cause as ErrorLike).message, maxLength);
        return message ?? fallback;
    }

    return fallback;
}
