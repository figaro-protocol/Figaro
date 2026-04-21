import { useEffect, useState } from "react";

interface Props {
    title?: string;
    activeLabel: string | null;
    isPending: boolean;
    isConfirming: boolean;
    isSuccess: boolean;
    errorMessage: string | null;
    onRetry?: () => void;
}

export function TransactionStatusBanner({
    title = "Status",
    activeLabel,
    isPending,
    isConfirming,
    isSuccess,
    errorMessage,
    onRetry,
}: Props) {
    const [dismissed, setDismissed] = useState(false);

    // Reset dismissed state when a new action starts
    useEffect(() => {
        if (isPending || isConfirming) setDismissed(false);
    }, [isPending, isConfirming]);

    if (dismissed) return null;
    if (!activeLabel && !errorMessage && !isSuccess) return null;

    const toneClass = errorMessage
        ? "border-red-200 bg-red-50 text-red-700"
        : isSuccess
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-neutral-200 bg-neutral-50 text-neutral-700";

    const message = errorMessage
        ? errorMessage
        : isPending
            ? `Please confirm ${activeLabel} in your wallet.`
            : isConfirming
                ? `Processing ${activeLabel}\u2026`
                : activeLabel
                    ? `${activeLabel} complete.`
                    : "Done.";

    return (
        <div className={`rounded border p-3 text-sm ${toneClass}`} role={errorMessage ? "alert" : "status"} aria-live={errorMessage ? "assertive" : "polite"}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="font-semibold mb-1">{title}</p>
                    <p>{message}</p>
                    {errorMessage && onRetry && (
                        <button
                            onClick={onRetry}
                            className="mt-2 text-xs font-semibold underline hover:no-underline"
                        >
                            Retry
                        </button>
                    )}
                </div>
                {(isSuccess || errorMessage) && !isPending && !isConfirming && (
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-current opacity-50 hover:opacity-100 text-lg leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}