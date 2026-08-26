/**
 * lib/shared/urlQuery.ts — "the URL query IS the state" helpers shared by
 * the explorer read-models (`lib/data/explorer.ts`, `lib/registries/explorer.ts`),
 * whose pages parse the query into state and serialise it back so every view
 * is a permalink. Nothing here throws on a hand-typed link.
 */

/** Constrain a raw query value to a known vocabulary; unknown values fall
 *  back to the given default. */
export function pick<T extends readonly string[]>(
    values: T,
    raw: string | null | undefined,
    fallback: T[number],
): T[number] {
    return raw && (values as readonly string[]).includes(raw) ? (raw as T[number]) : fallback;
}

/** Read one key from either params shape a page receives — a live
 *  `URLSearchParams` or Next's plain searchParams record. Absent = "". */
export function queryParam(
    params: URLSearchParams | Record<string, string | undefined>,
    key: string,
): string {
    return (params instanceof URLSearchParams ? params.get(key) : params[key]) ?? "";
}

/** Case-insensitive substring match over a row's own `text` haystack — the
 *  free-text `q` filter every explorer view applies to its rows. */
export function filterRows<T extends { text: string }>(rows: readonly T[], q: string): T[] {
    if (!q) return [...rows];
    const needle = q.toLowerCase();
    return rows.filter((r) => r.text.toLowerCase().includes(needle));
}
