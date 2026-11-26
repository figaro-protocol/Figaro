"use client";

/**
 * useBusyAction — one user action at a time, with its in-flight flag and its
 * failure line.
 *
 * `run(failureMessage, action)` clears the last failure, raises `busy`, and
 * awaits `action`. A throw becomes `error` (the cause's own message, or
 * `failureMessage` when it carries none) and `run` resolves `undefined`;
 * `busy` drops either way. A surface renders `busy` on its button and
 * `error` beside it.
 */

import { useCallback, useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";

export function useBusyAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = useCallback(async <R,>(failureMessage: string, action: () => Promise<R>): Promise<R | undefined> => {
        setBusy(true);
        setError(null);
        try {
            return await action();
        } catch (e) {
            setError(extractErrorMessage(e, failureMessage));
            return undefined;
        } finally {
            setBusy(false);
        }
    }, []);
    return { busy, error, setError, run };
}
