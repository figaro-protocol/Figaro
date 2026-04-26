"use client";

/**
 * CommitmentSignPreviewProvider — global mount for the pre-sign gate.
 *
 * Subscribes to `commitmentSignPreviewStore`. When `requestSignConfirmation`
 * is called from anywhere in the app (currently only `useCommitmentFlow.signCommitment`),
 * the store posts a pending preview; this provider renders the
 * AgreementPreviewModal. User clicks Confirm or Cancel; the store resolves
 * the awaited promise; the modal disappears.
 *
 * Mount once in `app/providers.tsx` (inside the chain-guard / commerce
 * context where signing actually happens). No props.
 */

import { useEffect, useState } from "react";
import { AgreementPreviewModal } from "@/components/core/AgreementPreviewModal";
import {
    cancelPendingSign,
    confirmPendingSign,
    subscribeToPendingSign,
    type PendingPreview,
} from "@/lib/core/commitmentSignPreviewStore";

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
            onConfirm={confirmPendingSign}
            onCancel={cancelPendingSign}
        />
    );
}
