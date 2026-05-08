"use client";

/**
 * ModalChrome — accessible dialog chrome shared by every modal in the app.
 *
 * Owns the cross-cutting modal concerns that previously lived inline,
 * inconsistently, across 4 modal components:
 *   - Backdrop with click-to-dismiss
 *   - Escape-to-dismiss
 *   - Tab focus trap inside the dialog
 *   - Initial focus on first focusable element
 *   - Focus restoration to the previously-focused element on unmount
 *   - Body scroll lock while open
 *   - ARIA `role="dialog"` + `aria-modal="true"` + caller-provided label
 *
 * Consumers control panel styling via `panelClassName` and provide their
 * own panel content as children. The chrome does not impose any visual
 * style on the panel itself.
 *
 * Visibility is caller-managed: render `<ModalChrome>` only when open.
 * The chrome does not own an `open` prop because each consumer controls
 * mounting differently (parent state, internal localStorage check, etc.).
 */

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalChromeProps {
    /** Dismiss handler — wired to ESC + backdrop click (each configurable). */
    onClose: () => void;
    /** Accessible name. Provide one of `aria-label` / `aria-labelledby`. */
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    /** Whether Escape dismisses. Default `true`. Pass `false` (or a dynamic
     *  boolean) for modals that gate dismissal on internal state. */
    dismissOnEscape?: boolean;
    /** Whether clicking the backdrop dismisses. Default `true`. */
    dismissOnBackdrop?: boolean;
    /** Vertical alignment. `center` for screen-centered modals; `top` for
     *  tall scrollable forms whose content may exceed the viewport. */
    align?: "center" | "top";
    /** Tailwind classes applied to the panel (`role="dialog"` div). */
    panelClassName?: string;
    /** Optional test-id on the backdrop (outermost div). */
    "data-testid"?: string;
    /** Optional test-id on the panel (the `role="dialog"` div). */
    panelTestId?: string;
    /** Modal content — the panel header / body / footer. */
    children: ReactNode;
}

export function ModalChrome({
    onClose,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    dismissOnEscape = true,
    dismissOnBackdrop = true,
    align = "center",
    panelClassName,
    "data-testid": backdropTestId,
    panelTestId,
    children,
}: ModalChromeProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<Element | null>(null);

    // Capture the prior focus + run setup once on mount; restore on unmount.
    useEffect(() => {
        previouslyFocused.current = document.activeElement;
        document.body.style.overflow = "hidden";

        const dialog = dialogRef.current;
        if (dialog) {
            dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
        }

        return () => {
            document.body.style.overflow = "";
            (previouslyFocused.current as HTMLElement | null)?.focus();
        };
        // Run-once on mount: capture/restore focus and lock body scroll.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-bind keydown when the dismiss-on-escape flag changes so OrderConfirmationModal
    // (which gates ESC on `dismissable || showCancel`) can flip behavior dynamically.
    useEffect(() => {
        const dialog = dialogRef.current;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && dismissOnEscape) {
                onClose();
                return;
            }
            if (e.key === "Tab" && dialog) {
                const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [dismissOnEscape, onClose]);

    const alignClass = align === "top" ? "items-start py-6 overflow-y-auto" : "items-center p-4";

    return (
        <div
            className={`fixed inset-0 z-50 flex justify-center bg-black/50 ${alignClass}`}
            data-testid={backdropTestId}
            onClick={(e) => {
                if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                className={panelClassName}
                data-testid={panelTestId}
            >
                {children}
            </div>
        </div>
    );
}
