/**
 * boundedConcurrency — the one bounded-concurrency walk over a list.
 *
 * A reader that fans out over many network reads (receipts, gateway fetches)
 * runs them in groups of `concurrency`: each group starts together and the
 * next starts once the slowest of the group has answered. One pass then waits
 * for the slowest read of each group, never for the sum of every read, and
 * never opens more than `concurrency` reads at once.
 */

/**
 * Call `visit` on every item of `items`, at most `concurrency` at a time, in
 * groups taken in the list's order. A `concurrency` below 1 is read as 1.
 * A rejected `visit` rejects the walk; a caller that treats a failed read as
 * absence catches inside `visit`.
 */
export async function forEachConcurrently<T>(
    items: readonly T[],
    concurrency: number,
    visit: (item: T) => Promise<void>,
): Promise<void> {
    const size = Math.max(1, concurrency);
    for (let start = 0; start < items.length; start += size) {
        await Promise.all(items.slice(start, start + size).map(visit));
    }
}
