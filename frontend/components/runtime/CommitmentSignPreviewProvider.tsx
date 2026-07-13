"use client";

/**
 * CommitmentSignPreviewProvider — global mount for the confirm gate.
 *
 * Subscribes to the confirm gate in `orderPreview`. When
 * `requestSignConfirmation` or `requestCommitConfirmation` is called from
 * anywhere in the app (the order commitment flow's sign step / standalone
 * commit broadcast), the store posts a pending preview; this provider renders
 * the AgreementPreviewModal with the matching wording. User clicks Confirm or
 * Cancel; the store resolves the awaited promise; the modal disappears.
 *
 * Mount once in `app/providers.tsx` (inside the chain-guard / commerce
 * context where signing actually happens). No props.
 */

import { useEffect, useState } from "react";
import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";
import {
    cancelPendingSign,
    confirmPendingSign,
    subscribeToPendingSign,
    type PendingPreview,
} from "@/lib/checkout/orderPreview";

export function CommitmentSignPreviewProvider() {
    const [pending, setPending] = useState<PendingPreview | null>(null);

    useEffect(() => {
        return subscribeToPendingSign(setPending);
    }, []);

    if (!pending) return null;

    return (
        <AgreementPreviewModal
            commitment={pending.commitment}
            agreement={pending.agreement}
            intent={pending.intent}
            onConfirm={confirmPendingSign}
            onCancel={cancelPendingSign}
        />
    );
}
