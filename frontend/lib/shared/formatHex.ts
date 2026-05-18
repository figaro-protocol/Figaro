/**
 * lib/shared/formatHex.ts
 *
 * Hex truncation for display. Replaces 20+ inline reimplementations of
 * the same `${addr.slice(0, 6)}…${addr.slice(-4)}` motif scattered
 * across components, modules, and lib helpers.
 *
 * Defaults: 6-char head, 4-char tail, U+2026 horizontal ellipsis. For
 * agreement / content hashes, prefer `truncateHex(hash, { head: 8 })`.
 */

export interface TruncateHexOptions {
    /** Characters to keep at the start. Default 6. */
    head?: number;
    /** Characters to keep at the end. Default 4. */
    tail?: number;
}

/**
 * Truncate a hex string for display: `0x1234…abcd`. Returns the input
 * unchanged when it is shorter than `head + tail + 1` (no truncation
 * needed) or when it is empty / undefined-coerced.
 */
export function truncateHex(value: string | undefined | null, options: TruncateHexOptions = {}): string {
    if (!value) return "";
    const head = options.head ?? 6;
    const tail = options.tail ?? 4;
    if (value.length < head + tail + 1) return value;
    if (tail === 0) return `${value.slice(0, head)}…`;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
