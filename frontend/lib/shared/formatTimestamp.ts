/**
 * formatTimestamp — the ONE home for rendering a moment for display.
 *
 * Chain time is unix SECONDS (block.timestamp, commitment deadlines,
 * MembersRegistry lock ends); wall-clock UI state (designer autosave, draft
 * edits) is Date.now() MILLISECONDS. Each function names its domain so no
 * caller ever guesses with a magnitude heuristic — the OrderNode secs-vs-ms
 * guess this module replaces was unfalsifiable precisely because its input's
 * unit was undeclared.
 */

/** Render a unix-SECONDS timestamp (chain domain). `options` follows
 *  `Intl.DateTimeFormatOptions`; absent → the locale's full date-time. */
export function formatBlockTimestamp(
    unixSeconds: number | bigint,
    options?: Intl.DateTimeFormatOptions,
): string {
    return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, options);
}

/** Render a wall-clock MILLISECONDS timestamp (Date.now() domain) as a
 *  relative age — "just now", "42s ago", "5m ago", "3h ago" — falling back
 *  to the locale's full date-time past a day. The single copy that replaces
 *  the divergent DesignerCanvas/DraftsList pair. */
export function formatRelative(tsMs: number): string {
    const seconds = Math.floor((Date.now() - tsMs) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatBlockTimestamp(tsMs / 1000);
}
