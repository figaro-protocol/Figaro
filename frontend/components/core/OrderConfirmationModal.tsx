"use client";

import React, { useEffect, useRef, useState } from "react";

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
    const dialogRef = useRef<HTMLDivElement>(null);
    const [showCancel, setShowCancel] = useState(false);

    useEffect(() => {
        if (!open || dismissable) { setShowCancel(false); return; }
        const timer = setTimeout(() => setShowCancel(true), TIMEOUT_SECONDS * 1000);
        return () => clearTimeout(timer);
    }, [open, dismissable]);

    useEffect(() => {
        if (!open) return;
        document.body.style.overflow = 'hidden';
        const dialog = dialogRef.current;
        if (dialog) {
            const focusable = dialog.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && (dismissable || showCancel)) onDismiss();
            if (e.key === 'Tab' && dialog) {
                const focusables = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, dismissable, showCancel, onDismiss]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={message} className="bg-white border border-gray-300 rounded p-6 w-full max-w-xs">
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
            </div>
        </div>
    );
};

export default OrderConfirmationModal;
