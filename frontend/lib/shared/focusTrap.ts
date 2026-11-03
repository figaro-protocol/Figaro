/**
 * focusTrap — the one Tab focus trap for an open dialog or panel: the
 * focusable elements inside a container, and the Tab / Shift+Tab wrap
 * between its first and last. Re-queried per keypress, so a section that
 * expands while open adds its focusables.
 */

const FOCUSABLE_SELECTOR = [
    "[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** The focusable elements inside `container`, in document order. */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Keep Tab inside `container`: wrap from the last focusable to the first,
 *  and Shift+Tab from the first to the last. A non-Tab key is ignored. */
export function trapTabFocus(e: KeyboardEvent, container: HTMLElement): void {
    if (e.key !== "Tab") return;
    const list = focusablesIn(container);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}
