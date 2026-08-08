"use client";

import { unpinWitnessContent } from "@/lib/composition/witnessContent";
import { PinErasureControl } from "@/components/runtime/PinErasureControl";

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
    return (
        <PinErasureControl
            hashes={contentRefs}
            testidPrefix="witness-pin-erasure"
            unpinOne={unpinWitnessContent}
            buttonLabel="Unpin witness content from IPFS"
            erasingLabel="Unpinning…"
            doneLabel={
                <>
                    Witness content unpinned from your IPFS node. The on-chain fingerprints
                    remain; content addressing means a counterparty node or a gateway may
                    still serve the values.
                </>
            }
        />
    );
}
