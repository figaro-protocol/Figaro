import type { Hex } from "viem";
import type { CapabilityActionDescriptor, CapabilityExecutionInput, DeliveryLifecycleSignalActionKind } from "@/lib/semantic/models";

type TransactionExecutionResult = Promise<Hex | undefined | void>;

export interface TransactionCapabilityExecutors {
    waitForTransactionConfirmation?: (txHash?: Hex) => Promise<void>;
    resolveProcess?: (processId: string) => TransactionExecutionResult;
    registerOperator?: (operatorRole: number, metadataURI: string, value?: bigint) => TransactionExecutionResult;
    /** Web2-strip (2026-04-26): replaces updateOperatorProfile. Switching role
     *  or metadata happens via withdraw + re-register. */
    withdrawOperatorDeposit?: () => TransactionExecutionResult;
    submitDisclosureCommitment?: (orderHash: string, disclosureRole: "restaurant" | "driver") => TransactionExecutionResult;
    submitDisclosureInventory?: (orderHash: string, grams: bigint) => TransactionExecutionResult;
    submitDeliveryLifecycleSignal?: (orderHash: string, signal: DeliveryLifecycleSignalActionKind, roleOrderHash?: string) => TransactionExecutionResult;
    submitDeliveryLifecycleProof?: (orderHash: string, signal: "declarePickedUp" | "declareDelivered", proof: { band: number; nonce: `0x${string}`; deviceSig: `0x${string}` }, roleOrderHash?: string) => TransactionExecutionResult;
    claimAuction?: (auctionId: string) => TransactionExecutionResult;
    claimAirdrop?: (amount: bigint, proof: `0x${string}`[]) => TransactionExecutionResult;
    claimVesting?: (variant: "founder" | "ecosystem") => TransactionExecutionResult;
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
        case "register-operator": {
            const metadataURI = input?.kind === "register-operator"
                ? (input.metadataURI ?? "")
                : "";
            txHash = await ensureExecutor(
                executors.registerOperator,
                "Operator registration is unavailable.",
            )(action.operatorRole, metadataURI);
            break;
        }
        case "withdraw-operator-deposit": {
            if (!globalThis.window?.confirm("Withdraw your operator deposit and clear the registry binding for this address? You'll need to re-register (with a fresh deposit and a new lock period) to operate again.")) return;
            txHash = await ensureExecutor(
                executors.withdrawOperatorDeposit,
                "Operator deposit withdrawal is unavailable.",
            )();
            break;
        }
        case "submit-disclosure-commitment": {
            const disclosureRole = input?.kind === "submit-disclosure-commitment"
                ? input.disclosureRole
                : action.disclosureRole;
            txHash = await ensureExecutor(
                executors.submitDisclosureCommitment,
                "Disclosure commitment execution is unavailable.",
            )(action.orderHash, disclosureRole);
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
        case "submit-delivery-lifecycle-signal":
            txHash = await ensureExecutor(
                executors.submitDeliveryLifecycleSignal,
                "Delivery lifecycle execution is unavailable.",
            )(action.orderHash, action.signal, action.roleOrderHash);
            break;
        case "submit-delivery-lifecycle-proof": {
            const proof = input?.kind === "submit-delivery-lifecycle-proof"
                ? input.proof
                : undefined;
            if (!proof) {
                throw new Error("Delivery proof input is required.");
            }
            txHash = await ensureExecutor(
                executors.submitDeliveryLifecycleProof,
                "Delivery proof execution is unavailable.",
            )(action.orderHash, action.signal, proof, action.roleOrderHash);
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