import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Map a FigaroCore error name to a user-facing message. 1:1 with
 * the error list of `src/core/kernel/FigaroCore.sol` — keep aligned when FigaroCore error set
 * changes (FigaroCore is deployed as it is, so changes are rare).
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

/** A contract's revert table: a decoded error name (and its args) to a
 *  user-facing message, or null when the table has nothing to say. */
export type RevertMessage = (
    errorName: string | undefined,
    args: readonly unknown[] | undefined,
) => string | null;

/** The message for any decoded revert: the FigaroCore wording when the name
 *  is FigaroCore's, else the error name itself. */
export function contractRevertMessage(errorName: string | undefined): string | null {
    if (!errorName) return null;
    return FIGARO_ERROR_MESSAGES[errorName] ?? errorName;
}

/**
 * The ONE viem revert-extraction preamble: walk to the decoded
 * `ContractFunctionRevertedError`, hand its errorName + args to the caller's
 * message table, and fall through to the generic `toError` when the table
 * has nothing to say (a wallet rejection, an RPC failure).
 */
export function translateContractRevert(err: unknown, message: RevertMessage): Error {
    if (err instanceof BaseError) {
        const revert = err.walk(
            (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | undefined;
        const translated = message(revert?.data?.errorName, revert?.data?.args);
        if (translated) return new Error(translated);
    }
    return toError(err);
}

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
            const message = contractRevertMessage(revertError.data?.errorName);
            if (message) return clamp(message, maxLength);
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
