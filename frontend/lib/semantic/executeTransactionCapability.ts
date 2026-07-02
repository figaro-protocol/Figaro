import type { Hex } from "viem";
import type {
    CapabilityActionDescriptor,
    CapabilityExecutionInput,
    SubmitClauseAttestationCapabilityAction,
    VestingVariant,
} from "@/lib/semantic/models";

type TransactionExecutionResult = Promise<Hex | undefined | void>;

export interface TransactionCapabilityExecutors {
    waitForTransactionConfirmation?: (txHash?: Hex) => Promise<void>;
    resolveProcess?: (processId: string) => TransactionExecutionResult;
    registerSeller?: (metadataURI: string, value?: bigint) => TransactionExecutionResult;
    /** Replaces the registered seller's metadataURI in place; deposit and
     *  lock period untouched. Maps to SellerRegistry.updateProfile. */
    updateSellerProfile?: (metadataURI: string) => TransactionExecutionResult;
    /** Withdraws the deposit and clears the dedup guard, freeing the address
     *  to re-register. Subject to the deploy-time lock period. */
    withdrawSellerDeposit?: () => TransactionExecutionResult;
    /** Generic runtime attestation — advances any clause's enum ladder (and pairs
     *  a proximity proof when the descriptor carries one). Replaces the per-clause
     *  merchant/courier executors. */
    submitClauseAttestation?: (action: SubmitClauseAttestationCapabilityAction) => TransactionExecutionResult;
    claimAirdrop?: (amount: bigint, proof: `0x${string}`[]) => TransactionExecutionResult;
    claimVesting?: (variant: VestingVariant) => TransactionExecutionResult;
}

function assertNever(_value: never): never {
    throw new Error("Unsupported transaction capability.");
}

function ensureExecutor<T>(executor: T | undefined, errorMessage: string): T {
    if (!executor) {
        throw new Error(errorMessage);
    }

    return executor;
}

export async function executeTransactionCapabilityAction(
    action: CapabilityActionDescriptor,
    executors: TransactionCapabilityExecutors,
    input?: CapabilityExecutionInput,
) {
    if (action.executionType !== "transaction") {
        throw new Error(`Capability ${action.kind} is not a transaction action.`);
    }

    let txHash: Hex | undefined | void;

    switch (action.kind) {
        case "resolve-process":
            txHash = await ensureExecutor(
                executors.resolveProcess,
                "Resolve-process execution is unavailable.",
            )(action.processId);
            break;
        case "register-seller": {
            const metadataURI = input?.kind === "register-seller"
                ? (input.metadataURI ?? "")
                : "";
            txHash = await ensureExecutor(
                executors.registerSeller,
                "Seller registration is unavailable.",
            )(metadataURI);
            break;
        }
        case "update-seller-profile": {
            const metadataURI = input?.kind === "update-seller-profile"
                ? (input.metadataURI ?? "")
                : "";
            txHash = await ensureExecutor(
                executors.updateSellerProfile,
                "Seller profile update is unavailable.",
            )(metadataURI);
            break;
        }
        case "withdraw-seller-deposit": {
            txHash = await ensureExecutor(
                executors.withdrawSellerDeposit,
                "Seller deposit withdrawal is unavailable.",
            )();
            break;
        }
        case "submit-clause-attestation":
            txHash = await ensureExecutor(
                executors.submitClauseAttestation,
                "Clause attestation execution is unavailable.",
            )(action);
            break;
        case "claim-airdrop":
            txHash = await ensureExecutor(
                executors.claimAirdrop,
                "Airdrop claim execution is unavailable.",
            )(action.amount, action.proof);
            break;
        case "claim-vesting":
            txHash = await ensureExecutor(
                executors.claimVesting,
                "Vesting claim execution is unavailable.",
            )(action.variant);
            break;
        default:
            return assertNever(action);
    }

    await executors.waitForTransactionConfirmation?.(txHash as Hex | undefined);
}