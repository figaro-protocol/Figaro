import { extractErrorMessage } from '@/lib/shared/errors';

interface OrderSurfaceActionOptions {
    action: () => Promise<void>;
    failureMessage: string;
    missingMessage?: string;
    enabled?: boolean;
    logLabel?: string;
    maxErrorLength?: number;
    onClearError?: () => void;
    onError?: (message: string, error?: unknown) => void;
    onSuccess?: () => void;
}

interface OrderSurfaceFailureOptions {
    failureMessage: string;
    logLabel?: string;
    maxErrorLength?: number;
    onBeforeError?: () => void;
    onError: (message: string, error?: unknown) => void;
}

export async function runOrderSurfaceAction({
    action,
    failureMessage,
    missingMessage,
    enabled = true,
    logLabel,
    maxErrorLength,
    onClearError,
    onError,
    onSuccess,
}: OrderSurfaceActionOptions): Promise<boolean> {
    if (!enabled) {
        if (missingMessage && onError) {
            onError(missingMessage);
        }
        return false;
    }

    onClearError?.();

    try {
        await action();
        onSuccess?.();
        return true;
    } catch (error) {
        if (logLabel) {
            console.error(logLabel, error);
        }

        const message = extractErrorMessage(
            error,
            failureMessage,
            maxErrorLength ? { maxLength: maxErrorLength } : undefined,
        );
        onError?.(message, error);
        return false;
    }
}

export function handleOrderSurfaceFailure(error: unknown, {
    failureMessage,
    logLabel,
    maxErrorLength,
    onBeforeError,
    onError,
}: OrderSurfaceFailureOptions): string {
    if (logLabel) {
        console.error(logLabel, error);
    }

    onBeforeError?.();

    const message = extractErrorMessage(
        error,
        failureMessage,
        maxErrorLength ? { maxLength: maxErrorLength } : undefined,
    );
    onError(message, error);
    return message;
}