"use client";

import React, { useEffect, useState } from "react";
import { ModalChrome } from "@/components/ui/ModalChrome";

interface OrderConfirmationModalProps {
    open: boolean;
    onDismiss: () => void;
    message: string;
    dismissable?: boolean;
}

const TIMEOUT_SECONDS = 30;

const OrderConfirmationModal: React.FC<OrderConfirmationModalProps> = ({
    open,
    onDismiss,
    message,
    dismissable = false,
}) => {
    const [showCancel, setShowCancel] = useState(false);

    useEffect(() => {
        if (!open || dismissable) { setShowCancel(false); return; }
        const timer = setTimeout(() => setShowCancel(true), TIMEOUT_SECONDS * 1000);
        return () => clearTimeout(timer);
    }, [open, dismissable]);

    if (!open) return null;

    // ESC and backdrop click only dismiss when the user is allowed to cancel:
    // either the modal is dismissable by design, or the timeout fallback has
    // exposed the close button.
    const canDismiss = dismissable || showCancel;

    return (
        <ModalChrome
            onClose={onDismiss}
            aria-label={message}
            dismissOnEscape={canDismiss}
            dismissOnBackdrop={canDismiss}
            panelClassName="bg-white border border-gray-300 rounded p-6 w-full max-w-xs"
        >
            <div className="flex items-center gap-3 mb-4">
                {!dismissable && !showCancel && (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin flex-shrink-0" role="status">
                        <span className="sr-only">Processing</span>
                    </div>
                )}
                <div className="text-sm text-black">{message}</div>
            </div>
            {showCancel && !dismissable && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                        Taking longer than expected. The transaction may still be pending in your wallet.
                    </p>
                    <div className="flex justify-end">
                        <button
                            className="px-4 py-2 text-xs bg-gray-200 text-black rounded hover:bg-gray-300"
                            onClick={onDismiss}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
            {dismissable && (
                <div className="flex justify-end">
                    <button
                        className="px-4 py-2 text-xs bg-black text-white rounded hover:bg-gray-800"
                        onClick={onDismiss}
                    >
                        OK
                    </button>
                </div>
            )}
        </ModalChrome>
    );
};

export default OrderConfirmationModal;
