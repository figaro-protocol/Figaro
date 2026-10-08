"use client";

import { unpinAgreement } from "@/lib/kernel/agreementFetch";
import { PinErasureControl, reportingUnpin } from "@/components/runtime/PinErasureControl";

/** The erase, reporting a refused unpin instead of swallowing it. */
const UNPIN_ONE = reportingUnpin(unpinAgreement);

/**
 * Controller-erasure for a process's committed-agreement pins.
 *
 * The signed agreement is the highest-PII IPFS artifact. Like the member profile,
 * evidence bundle, and device evidence, it has an erasure affordance: a party
 * erases their pinned copies here — deliberately, once the process's data are
 * no longer needed. Never automatic: the committed
 * agreement is the Layer-3 dispute data an off-chain forum receives, so it must
 * outlive `resolveProcess`.
 *
 * Best-effort by construction: content addressing means this erases only THIS
 * wallet's copies; a counterparty node or a gateway may still hold them. Mirrors
 * the evidence-bundle "Unpin from IPFS" affordance it sits beside.
 */
export function AgreementPinErasure({ agreementHashes }: { agreementHashes: string[] }) {
    return (
        <PinErasureControl
            hashes={agreementHashes}
            testidPrefix="agreement-pin-erasure"
            unpinOne={UNPIN_ONE}
            buttonLabel="Unpin agreement copies from IPFS"
            erasingLabel="Unpinning…"
            doneLabel={
                <>
                    Agreement copies unpinned from your IPFS node. Content addressing means a
                    counterparty node or a gateway may still hold them.
                </>
            }
        />
    );
}
