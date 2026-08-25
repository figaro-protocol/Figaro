"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";

/**
 * The shared idle/erasing/done control behind every author-pins →
 * author-erases IPFS affordance (`AgreementPinErasure`, `WitnessPinErasure`):
 * best-effort unpin of this wallet's own copies, deliberate and never
 * automatic. Content addressing means a counterparty node or a gateway may
 * still hold the value — each wrapper states that in its own `doneLabel`.
 */
export interface PinErasureControlProps {
    /** The hashes/refs to unpin. Renders nothing when empty. */
    hashes: string[];
    /** Base id for the three testids: `{prefix}`, `{prefix}-button`, `{prefix}-done`. */
    testidPrefix: string;
    /** Called once per hash; failures are not surfaced individually — the
     *  control moves to "done" once every call has settled. */
    unpinOne: (hash: string) => Promise<unknown>;
    buttonLabel: string;
    erasingLabel: string;
    doneLabel: ReactNode;
}

export function PinErasureControl({
    hashes,
    testidPrefix,
    unpinOne,
    buttonLabel,
    erasingLabel,
    doneLabel,
}: PinErasureControlProps) {
    const [status, setStatus] = useState<"idle" | "erasing" | "done">("idle");

    const handleUnpin = useCallback(async () => {
        setStatus("erasing");
        await Promise.all(hashes.map((h) => unpinOne(h)));
        setStatus("done");
    }, [hashes, unpinOne]);

    if (hashes.length === 0) return null;

    return (
        <div className="mt-4" data-testid={testidPrefix}>
            {status === "done" ? (
                <p className="text-xs text-ink-muted" data-testid={`${testidPrefix}-done`}>
                    {doneLabel}
                </p>
            ) : (
                <button
                    onClick={() => void handleUnpin()}
                    disabled={status === "erasing"}
                    data-testid={`${testidPrefix}-button`}
                    className="text-xs text-ink-muted hover:text-ink-body underline disabled:opacity-50"
                >
                    {status === "erasing" ? erasingLabel : buttonLabel}
                </button>
            )}
        </div>
    );
}
