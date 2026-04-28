type ErrorLike = {
    shortMessage?: unknown;
    message?: unknown;
};

export function extractErrorMessage(
    cause: unknown,
    fallback: string,
    options?: { maxLength?: number },
): string {
    const normalize = (value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (options?.maxLength && trimmed.length > options.maxLength) {
            return trimmed.slice(0, options.maxLength);
        }
        return trimmed;
    };

    if (cause instanceof Error) {
        const message = normalize((cause as ErrorLike).shortMessage)
            ?? normalize(cause.message);
        return message ?? fallback;
    }

    if (typeof cause === "object" && cause !== null) {
        const message = normalize((cause as ErrorLike).shortMessage)
            ?? normalize((cause as ErrorLike).message);
        return message ?? fallback;
    }

    return fallback;
}