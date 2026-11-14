import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Map a contract's custom-error name to a user-facing message: one text for
 * every error in the ABIs the app decodes with (`@figaro-protocol/sdk`'s lists
 * and `abi/*.json`), written from the condition the contract raises it under.
 * `tests/lib/revertMessages.test.ts` fails when a contract gains an error with
 * no text here, or when this map keeps a text for an error no ABI holds. A name
 * two contracts raise has one text that fits each of them. The errors of the
 * token library the contracts build on (ERC-20, signatures, permit, safe
 * transfer) are listed too: a token's refusal surfaces through the same decode.
 */
export const FIGARO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
    // FigaroCore
    DeadlineExpired: "The deadline in the signed commitment has passed, so it can no longer be submitted.",
    InvalidBuyerSignature: "The buyer's signature does not match this commitment.",
    InvalidSellerSignature: "The seller's signature does not match this commitment.",
    ZeroPayment: "The payment must be more than zero.",
    ProcessAlreadyExists: "A process with this id already exists, so this commitment cannot open it again.",
    UnknownProcess: "No process with this id has been committed.",
    CumulativeValueMismatch: "The running total in this commitment is not the process's running total plus this payment.",
    NotProcessBuyer: "Only the buyer who opened the process can add an order to it (a later order must name that buyer) or resolve it.",
    CurrencyMismatch: "The token of this order is not the token of the process.",
    OrderNotCommitted: "An order in the list is not an active order of this process: it was not committed, it is already resolved, or the commitment given does not match it.",
    NoActiveOrders: "This process has no active order left to resolve.",
    IncompleteOrderList: "The list must name every active order of the process, no fewer and no more.",
    DuplicateCommitment: "This commitment has already been submitted.",
    FeeOnTransferDetected: "The token moved a different amount than was sent, as a token that takes a cut of each transfer does. It is not supported.",
    InvalidRootCumulativeValue: "The first order of a process must have a running total equal to its payment.",
    ProcessAlreadyResolved: "This process is already resolved, so it takes no further order.",
    // AttestationCoordinator
    NotAuthorized: "Only the seller of the order can attest as its seller, and only its buyer as its buyer.",
    UnknownOrder: "This order has not been committed.",
    OrderResolved: "This order is already resolved, so it can no longer be attested.",
    InvalidInclusionProof: "The proof does not show this clause's data inside the agreement the parties signed.",
    // FigaroBatchVerifier
    StateRootMismatch: "The proof starts from a state that is not the verifier's current state.",
    ChainIdMismatch: "The proof was made for a different chain.",
    VerifyingContractMismatch: "The proof was made for a different verifier contract.",
    PositionHashMismatch: "The positions in this batch are not the ones the proof covers.",
    AttestationHashMismatch: "The attestations in this batch are not the ones the proof covers.",
    SpecBindingsHashMismatch: "The clause specs named in this batch are not the ones the proof covers.",
    UsageAccrualHashMismatch: "The uses counted in this batch are not the ones the proof covers.",
    OperationsHashMismatch: "The operations in this batch are not the ones the proof covers.",
    MalformedOperationStream: "The operation list of this batch is malformed.",
    VerifierNotPinned: "The proof verifier does not name its own circuit, so it is refused.",
    BatchTimestampOutOfRange: "The time the batch was proved at is in the future or too old.",
    PublicValuesLengthMismatch: "The proof's public values have the wrong length.",
    SpecBindingMismatch: "A clause spec in this batch is not the document its clause key names.",
    ClauseNotRegistered: "A clause in this batch is not registered in the clause registry.",
    ZeroVerifier: "The proof verifier address is zero.",
    VerifierNotContract: "The proof verifier address holds no contract.",
    ZeroClauseRegistry: "The clause registry address is zero.",
    ZeroUsageCounter: "The usage counter address is zero.",
    UsageCounterNotBoundToThis: "The usage counter names another batch verifier.",
    BuyerHasNoCode: "A buyer's resolution was authorized by contract code, but the buyer's wallet holds no code.",
    WalletCodeAuthorizationRefused: "The buyer's wallet code did not authorize resolving this process.",
    AttesterHasNoCode: "An attestation was authorized by contract code, but the attesting wallet holds no code.",
    WalletCodeAttestationRefused: "The attesting wallet's code did not authorize this attestation.",
    // Registries: clauses, agreements, assemblies, members
    AlreadyRegistered: "This is already registered: a clause key, or a wallet that is already a member.",
    AgreementAlreadyRegistered: "This agreement is already registered.",
    AssemblyAlreadyRegistered: "This assembly is already registered.",
    NotRegistered: "Nothing is registered at this key, or this wallet is not a member.",
    NotRegisteredBy: "Only the wallet that made the registration can withdraw its stake.",
    AlreadyWithdrawn: "The stake of this registration was already withdrawn.",
    TransferFailed: "Sending the deposit back failed.",
    WrongDeposit: "The value sent is not the registry's registration stake.",
    InsufficientDeposit: "The value sent is not the registration stake.",
    EmptyContentURI: "The content address is empty.",
    ZeroClauseKey: "The clause key must not be zero.",
    ZeroAssemblyHash: "The assembly hash must not be zero.",
    ZeroAgreementHash: "The agreement hash must not be zero.",
    ReservedKeyIsNotARegistration: "This key is reserved by the agreement format and is never a registration.",
    NothingPending: "This wallet has no withdrawal pending.",
    CooldownActive: "The withdrawal cooldown has not ended yet.",
    // Designer rewards: FlorinToken, UsageCounter, RpgfMinter
    DeployerMintRenounced: "The deployer has renounced: it can no longer register a minter or mint.",
    MinterAlreadySet: "This minter is already registered.",
    MinterCapExceeded: "This mint would take the minter past its cap.",
    MinterNotRegistered: "This wallet is not a registered minter.",
    NotMinter: "Only the deployer of the florin token can register a minter or renounce.",
    SupplyCapExceeded: "This would take the florin supply, or the sum of the minter caps, past the maximum supply.",
    ZeroAddress: "An address given is zero.",
    AccrualClosed: "The last accrual period has ended, so no further use is counted.",
    AlreadyCounted: "This use of the clause, agreement or assembly was already counted for this process.",
    ClauseAgreementOrAssemblyNotRegistered: "The clause, agreement or assembly is not registered, or its stake was withdrawn.",
    EmptyPeriods: "The list of accrual periods is empty.",
    TooManyPeriods: "There are too many accrual periods.",
    PeriodsNotAscending: "The accrual period ends are not in ascending order.",
    ZeroMinSellers: "The minimum number of sellers must be more than zero.",
    InvalidMembershipProof: "The proof does not show this agreement inside the assembly.",
    NotBatchVerifier: "Only the batch verifier can count the uses of a batch.",
    OrderNotResolved: "This order is not resolved yet.",
    PeriodMismatch: "The batch names an accrual period that is not the one now open.",
    ProvenanceLeafMismatch: "The batch names a provenance key other than the one the counter holds.",
    SellerNotStaked: "The seller of this process holds no live member stake.",
    AmountsPeriodsMismatch: "The number of amounts is not the number of accrual periods.",
    DuplicateClauseOrAssembly: "The list names the same clause, agreement or assembly twice.",
    NoClausesOrAssemblies: "The list of clauses, agreements and assemblies is empty.",
    NotAuthorOfRecord: "This wallet is not the live registrant of a clause, agreement or assembly in the list.",
    NotLiveMember: "This wallet holds no live member stake.",
    NothingToClaim: "There is nothing to claim for this period.",
    PeriodBudgetExceeded: "This claim would take the period past its florin amount.",
    PeriodStillAccruing: "This period has not ended, so it cannot be claimed yet.",
    UnknownKind: "The kind named is not a clause, an agreement or an assembly.",
    UnknownPeriod: "No accrual period has this number.",
    // Swap-funded bond (composability)
    NothingToFund: "Neither party chose to fund its bond by a swap.",
    SwapCallFailed: "The swap call failed.",
    OutputBelowBond: "The swap produced less of the process token than the bond needs.",
    // The token library the contracts build on
    ERC20InsufficientBalance: "The wallet's balance of this token is below the amount.",
    ERC20InsufficientAllowance: "The allowance given for this token is below the amount.",
    ERC20InvalidSender: "The sender of this token transfer is not valid.",
    ERC20InvalidReceiver: "The receiver of this token transfer is not valid.",
    ERC20InvalidApprover: "The approver of this token allowance is not valid.",
    ERC20InvalidSpender: "The spender of this token allowance is not valid.",
    ECDSAInvalidSignature: "The signature is not valid.",
    ECDSAInvalidSignatureLength: "The signature has the wrong length.",
    ECDSAInvalidSignatureS: "The signature's s value is not in the accepted range.",
    ERC2612ExpiredSignature: "The permit signature has expired.",
    ERC2612InvalidSigner: "The permit signature was not made by the token owner.",
    InvalidAccountNonce: "The permit signature names a nonce that is not the account's current one.",
    SafeERC20FailedOperation: "The token's transfer or approval call failed.",
    ReentrancyGuardReentrantCall: "A call entered the contract again while it was running.",
    InvalidShortString: "A short string given is not valid.",
    StringTooLong: "A string given is too long.",
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
