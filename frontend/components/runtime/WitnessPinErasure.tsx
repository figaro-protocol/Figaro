"use client";

import { useCallback, useState } from "react";
import { unpinWitnessContent } from "@/lib/composition/witnessContent";

/**
 * Controller-erasure for a process's published witness-content pins.
 *
 * Public-disposition attestation content publishes at its fingerprint-derived
 * keccak-CID (`lib/composition/witnessContent`); this is the erasure half of
 * that publish story — the same author-pins → author-erases symmetry as the
 * member profile, device evidence, and committed-agreement pins. Deliberate,
 * never automatic: the values are runtime evidence a dispute forum may want,
 * so a party erases them once the process's records are no longer needed.
 *
 * Best-effort by construction: the CID is derived from each attestation's
 * on-chain fingerprint, and unpinning an absent pin is absence — so offering
 * every contentRef of the process is safe; only the pins THIS node holds go.
 * The fingerprints themselves are on-chain and permanent; only the published
 * values become unresolvable.
 */
export function WitnessPinErasure({ contentRefs }: { contentRefs: string[] }) {
    const [status, setStatus] = useState<"idle" | "erasing" | "done">("idle");

    const handleUnpin = useCallback(async () => {
        setStatus("erasing");
        await Promise.all(contentRefs.map((ref) => unpinWitnessContent(ref)));
        setStatus("done");
    }, [contentRefs]);

    if (contentRefs.length === 0) return null;

    return (
        <div className="mt-4" data-testid="witness-pin-erasure">
            {status === "done" ? (
                <p className="text-xs text-ink-muted" data-testid="witness-pin-erasure-done">
                    Witness content unpinned from your IPFS node. The on-chain fingerprints
                    remain; content addressing means a counterparty node or a gateway may
                    still serve the values.
                </p>
            ) : (
                <button
                    onClick={() => void handleUnpin()}
                    disabled={status === "erasing"}
                    data-testid="witness-pin-erasure-button"
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline disabled:opacity-50"
                >
                    {status === "erasing" ? "Unpinning…" : "Unpin witness content from IPFS"}
                </button>
            )}
        </div>
    );
}
