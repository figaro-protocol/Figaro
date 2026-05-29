import type { Hex } from "viem";
import type {
    CapabilityActionDescriptor,
    CapabilityExecutionInput,
    CourierProcessEventKind,
    CourierProximityProofEventKind,
    MerchantProcessEventKind,
    VestingVariant,
} from "@/lib/semantic/models";
import type { ProximityProof } from "@/lib/mechanisms/useCourierProcess";

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
    submitDisclosureCommitment?: (orderHash: string) => TransactionExecutionResult;
    submitDisclosureInventory?: (orderHash: string, grams: bigint) => TransactionExecutionResult;
    submitMerchantProcessSignal?: (orderHash: string, eventType: MerchantProcessEventKind, roleOrderHash?: string) => TransactionExecutionResult;
    submitCourierProcessSignal?: (orderHash: string, eventType: CourierProcessEventKind, roleOrderHash?: string) => TransactionExecutionResult;
    submitCourierProcessSignalWithProof?: (orderHash: string, eventType: CourierProximityProofEventKind, proof: ProximityProof, roleOrderHash?: string) => TransactionExecutionResult;
    claimAuction?: (auctionId: string) => TransactionExecutionResult;
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
            if (!globalThis.window?.confirm("This will settle the entire process and release all bonds. Continue?")) return;
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
            if (!globalThis.window?.confirm("Withdraw your seller deposit and clear the registry binding for this address? You'll need to re-register (with a fresh deposit and a new lock period) to operate again.")) return;
            txHash = await ensureExecutor(
                executors.withdrawSellerDeposit,
                "Seller deposit withdrawal is unavailable.",
            )();
            break;
        }
        case "submit-disclosure-commitment": {
            txHash = await ensureExecutor(
                executors.submitDisclosureCommitment,
                "Disclosure commitment execution is unavailable.",
            )(action.orderHash);
            break;
        }
        case "submit-disclosure-inventory": {
            const grams = input?.kind === "submit-disclosure-inventory"
                ? input.grams
                : 0n;
            if (grams <= 0n) throw new Error("Enter a non-zero emissions value in grams CO2e.");
            txHash = await ensureExecutor(
                executors.submitDisclosureInventory,
                "Disclosure inventory execution is unavailable.",
            )(action.orderHash, grams);
            break;
        }
        case "submit-merchant-process-signal":
            txHash = await ensureExecutor(
                executors.submitMerchantProcessSignal,
                "Merchant-process execution is unavailable.",
            )(action.orderHash, action.eventType, action.roleOrderHash);
            break;
        case "submit-courier-process-signal":
            txHash = await ensureExecutor(
                executors.submitCourierProcessSignal,
                "Courier-process execution is unavailable.",
            )(action.orderHash, action.eventType, action.roleOrderHash);
            break;
        case "submit-courier-process-signal-with-proof": {
            const proof = input?.kind === "submit-courier-process-signal-with-proof"
                ? input.proof
                : undefined;
            if (!proof) {
                throw new Error("Courier-process proof input is required.");
            }
            txHash = await ensureExecutor(
                executors.submitCourierProcessSignalWithProof,
                "Courier-process proof execution is unavailable.",
            )(action.orderHash, action.eventType, proof, action.roleOrderHash);
            break;
        }
        case "claim-auction":
            txHash = await ensureExecutor(
                executors.claimAuction,
                "Auction-claim execution is unavailable.",
            )(action.auctionId);
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