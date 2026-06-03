import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/shared/errors";

/**
 * Show a success toast with optional transaction hash.
 */
function showSuccess(message: string, txHash?: string) {
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
 * Show an error toast. Decodes contract reverts, wallet rejections, and
 * mempool/RPC failures via `extractErrorMessage` — same logic any inline
 * error display uses.
 */
function showError(error: unknown, fallbackMessage?: string) {
    const title = fallbackMessage ?? "Transaction Failed";
    toast.error(title, {
        description: extractErrorMessage(error, title),
        duration: 5000,
    });
}

/**
 * Show a warning toast.
 */
export function showWarning(message: string) {
    toast.warning(message, { duration: 4000 });
}
