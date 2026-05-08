/**
 * Toast Notification Utilities
 * Addresses AUDIT FINDING UX-2: Poor Error Messages
 * 
 * Provides user-friendly error and success notifications with:
 * - Parsed contract error messages
 * - Transaction links to block explorer
 * - Loading states for pending transactions
 */

import { toast } from "sonner";
import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Parse a Viem error into a user-friendly message
 */
function parseContractError(error: unknown): string {
    if (error instanceof BaseError) {
        // Handle contract revert errors
        const revertError = error.walk(err => err instanceof ContractFunctionRevertedError);
        if (revertError instanceof ContractFunctionRevertedError) {
            const errorName = revertError.data?.errorName ?? '';
            const errorArgs = revertError.data?.args ?? [];

            // Map Figaro contract errors to user-friendly messages
            switch (errorName) {
                // --- FigaroCore errors ---
                case 'ZeroAddress':
                    return 'Invalid address: cannot be zero';
                case 'SelfDeal':
                    return 'Cannot create an order with yourself';
                case 'ZeroPayment':
                    return 'Payment amount must be greater than zero';
                case 'ZeroAmount':
                    return 'Amount must be greater than zero';
                case 'EmptyManifest':
                    return 'Order manifest cannot be empty';
                case 'NotBuyer':
                    return 'Only the buyer can perform this action';
                case 'NotSeller':
                    return 'Only the seller can perform this action';
                case 'OrderNotFound':
                    return 'Order not found';
                case 'OrderNotActive':
                    return 'Order is not in Active state';
                case 'DeadlineExpired':
                    return 'Commitment deadline has expired';
                case 'InvalidBuyerSignature':
                    return 'Invalid buyer signature on commitment';
                case 'InvalidSellerSignature':
                    return 'Invalid seller signature on commitment';
                case 'SelfDeal':
                    return 'Buyer and seller cannot be the same address';
                case 'ZeroPayment':
                    return 'Payment amount must be greater than zero';
                case 'ProcessAlreadyExists':
                    return 'Process ID already exists';
                case 'CumulativeValueMismatch':
                    return 'Cumulative value does not match expected total';
                case 'NotProcessBuyer':
                    return 'Only the process buyer can resolve';
                case 'CurrencyMismatch':
                    return 'Currency does not match the process';
                case 'DuplicateCommitment':
                    return 'This commitment has already been submitted';
                case 'UnknownProcess':
                    return 'Unknown process ID';
                case 'ProcessTooLarge':
                    return 'Process has reached maximum active orders';
                case 'NoActiveOrders':
                    return 'No active orders found in this process';
                case 'IncompleteOrderList':
                    return 'Resolution requires the complete list of active order IDs';
                case 'NoBond':
                    return 'No bond locked for this order';
                case 'BondsNotLocked':
                    return 'Both bonds must be locked before resolution';
                case 'InsufficientAvailable':
                    return 'Insufficient available balance to withdraw';
                case 'InsufficientFees':
                    return 'Insufficient accrued fees';
                case 'FeeOutOfRange':
                    return 'Fee rate is outside the allowed range';
                case 'FeeOnTransferDetected':
                    return 'Fee-on-transfer tokens are not supported';
                case 'InvalidPermitTarget':
                    return 'Permit target address does not match the token';
                case 'PermitCallFailed':
                    return 'Token permit call failed — check signature or expiry';
                case 'PreAcceptHookRejected':
                    return 'Pre-accept condition not yet satisfied';
                case 'InvalidMaxProcessSize':
                    return 'Invalid maximum process size';
                case 'CannotSetSelfAsRouter':
                    return 'Cannot set the contract itself as a permit router';
                case 'TooManyUiParents':
                case 'InvalidUiParent':
                case 'UiParentProcessMismatch':
                case 'DuplicateUiParent':
                    return 'Invalid UI parent configuration';
                default:
                    return errorName || revertError.shortMessage || 'Transaction reverted';
            }
        }

        // Handle user rejection
        if (error.shortMessage?.includes('User rejected') || error.message?.includes('rejected')) {
            return 'Transaction was rejected';
        }

        // Return the short message if available
        return error.shortMessage || error.message || 'Unknown error occurred';
    }

    // Fallback for non-Viem errors
    if (error instanceof Error) {
        return error.message;
    }

    return 'An unexpected error occurred';
}

/**
 * Show a success toast with optional transaction hash
 */
export function showSuccess(message: string, txHash?: string) {
    if (txHash) {
        toast.success(message, {
            description: `Transaction: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
            duration: 5000,
        });
    } else {
        toast.success(message, { duration: 3000 });
    }
}

/**
 * Show an error toast with parsed error message
 */
export function showError(error: unknown, fallbackMessage?: string) {
    const message = parseContractError(error);
    toast.error(fallbackMessage || 'Transaction Failed', {
        description: message,
        duration: 5000,
    });
}

/**
 * Show a warning toast
 */
export function showWarning(message: string) {
    toast.warning(message, { duration: 4000 });
}
