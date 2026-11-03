/**
 * The one clipboard write. The browser may refuse it (permission denied, the
 * document not focused, an insecure context with no Clipboard API), so the
 * write resolves to whether it happened and never rejects: a caller shows
 * "Copied" only on `true`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
