"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";

/**
 * The shared idle/erasing/done control behind every author-pins →
 * author-erases IPFS affordance (`AgreementPinErasure`, `WitnessPinErasure`):
 * unpin of this wallet's own copies, deliberate and never
 * automatic. Content addressing means a counterparty node or a gateway may
 * still hold the value — each wrapper states that in its own `doneLabel`.
 * An unpin the node or pin service refuses is shown as refused, with the
 * service's answer — never as unpinned.
 */
export interface PinErasureControlProps {
    /** The hashes/refs to unpin. Renders nothing when empty. */
    hashes: string[];
    /** Base id for the testids: `{prefix}`, `{prefix}-button`, `{prefix}-done`,
     *  `{prefix}-refused`. */
    testidPrefix: string;
    /** Called once per hash; a rejection is a refused unpin — the control
     *  lists each refusal instead of reporting the copies unpinned. */
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
    const [refusals, setRefusals] = useState<string[]>([]);

    const handleUnpin = useCallback(async () => {
        setStatus("erasing");
        setRefusals([]);
        const results = await Promise.allSettled(hashes.map((h) => unpinOne(h)));
        const refused = results.flatMap((r) =>
            r.status === "rejected" ? [extractErrorMessage(r.reason, "The unpin was refused.")] : [],
        );
        setRefusals(refused);
        setStatus(refused.length > 0 ? "idle" : "done");
    }, [hashes, unpinOne]);

    if (hashes.length === 0) return null;

    return (
        <div className="mt-4" data-testid={testidPrefix}>
            {status === "done" ? (
                <p className="text-xs text-ink-muted" data-testid={`${testidPrefix}-done`}>
                    {doneLabel}
                </p>
            ) : (
                <>
                    <button
                        onClick={() => void handleUnpin()}
                        disabled={status === "erasing"}
                        data-testid={`${testidPrefix}-button`}
                        className="text-xs text-ink-muted hover:text-ink-body underline disabled:opacity-50"
                    >
                        {status === "erasing" ? erasingLabel : buttonLabel}
                    </button>
                    {refusals.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-error-fg" data-testid={`${testidPrefix}-refused`}>
                            {refusals.map((message, i) => (
                                <li key={i}>{message}</li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
