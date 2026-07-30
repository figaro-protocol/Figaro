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
    registerMember?: (metadataURI: string, value?: bigint) => TransactionExecutionResult;
    /** Replaces the registered seller's metadataURI in place; deposit and
     *  lock period untouched. Maps to MembersRegistry.updateProfile. */
    updateMemberProfile?: (metadataURI: string) => TransactionExecutionResult;
    /** Withdraws the deposit and clears the dedup guard, freeing the address
     *  to re-register. Subject to the deploy-time lock period. */
    withdrawMemberDeposit?: () => TransactionExecutionResult;
    /** Generic runtime attestation — advances any clause's enum ladder, or
     *  files a declared witness stage (values arrive from the rail's generic
     *  form). Replaces the per-clause merchant/courier executors. */
    submitClauseAttestation?: (
        action: SubmitClauseAttestationCapabilityAction,
        values?: Record<string, unknown>,
    ) => TransactionExecutionResult;
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
        case "register-member": {
            const metadataURI = input?.kind === "register-member"
                ? (input.metadataURI ?? "")
                : "";
            txHash = await ensureExecutor(
                executors.registerMember,
                "Member registration is unavailable.",
            )(metadataURI);
            break;
        }
        case "update-member-profile": {
            const metadataURI = input?.kind === "update-member-profile"
                ? (input.metadataURI ?? "")
                : "";
            txHash = await ensureExecutor(
                executors.updateMemberProfile,
                "Member profile update is unavailable.",
            )(metadataURI);
            break;
        }
        case "withdraw-member-deposit": {
            txHash = await ensureExecutor(
                executors.withdrawMemberDeposit,
                "Seller deposit withdrawal is unavailable.",
            )();
            break;
        }
        case "submit-clause-attestation":
            txHash = await ensureExecutor(
                executors.submitClauseAttestation,
                "Clause attestation execution is unavailable.",
            )(action, input?.kind === "submit-clause-attestation" ? input.values : undefined);
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