"use client";

import { useCallback, useState } from "react";
import { unpinAgreement } from "@/lib/kernel/agreementFetch";

/**
 * Controller-erasure for a process's committed-agreement pins.
 *
 * The signed agreement is the highest-PII IPFS artifact and was the one high-PII
 * pin with no erasure affordance (the member profile, evidence bundle, and device
 * evidence all have one). A party erases their pinned copies here — deliberately,
 * once the process's records are no longer needed. Never automatic: the committed
 * agreement is the Layer-3 dispute record an off-chain forum receives, so it must
 * outlive `resolveProcess`.
 *
 * Best-effort by construction: content addressing means this erases only THIS
 * wallet's copies; a counterparty node or a gateway may still hold them. Mirrors
 * the evidence-bundle "Unpin from IPFS" affordance it sits beside.
 */
export function AgreementPinErasure({ agreementHashes }: { agreementHashes: string[] }) {
    const [status, setStatus] = useState<"idle" | "erasing" | "done">("idle");

    const handleUnpin = useCallback(async () => {
        setStatus("erasing");
        await Promise.all(agreementHashes.map((h) => unpinAgreement(h)));
        setStatus("done");
    }, [agreementHashes]);

    if (agreementHashes.length === 0) return null;

    return (
        <div className="mt-4" data-testid="agreement-pin-erasure">
            {status === "done" ? (
                <p className="text-xs text-ink-muted" data-testid="agreement-pin-erasure-done">
                    Agreement copies unpinned from your IPFS node. Content addressing means a
                    counterparty node or a gateway may still hold them.
                </p>
            ) : (
                <button
                    onClick={() => void handleUnpin()}
                    disabled={status === "erasing"}
                    data-testid="agreement-pin-erasure-button"
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline disabled:opacity-50"
                >
                    {status === "erasing" ? "Unpinning…" : "Unpin agreement copies from IPFS"}
                </button>
            )}
        </div>
    );
}
