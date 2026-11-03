import { extractErrorMessage } from '@/lib/shared/errors';

interface OrderSurfaceFailureOptions {
    failureMessage: string;
    logLabel?: string;
    maxErrorLength?: number;
    onBeforeError?: () => void;
    onError: (message: string, error?: unknown) => void;
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