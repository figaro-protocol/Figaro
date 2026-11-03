/**
 * NetworkRead — the one shape of a read of network state (the chain, IPFS).
 *
 * A read is in one of three states, and only three:
 *  - `pending`: in flight (or not yet asked). The one state a surface may show
 *    a loading indicator for.
 *  - `absent`: the read FAILED, or returned nothing for what it asked
 *    about. A surface renders nothing for it and takes no action on it
 *    (docs/OPEN_WORLD.md § 1 "No fallbacks"): no error text, no empty-state
 *    sentence, no default value, no redirect, no button.
 *  - `present`: the chain or IPFS answered, with `value`. A list the chain
 *    really returned empty is `present([])`, and only that may render a
 *    surface's plain empty state.
 *
 * A failed read is never `[]`, `undefined`, `null` or a default value a
 * consumer could mistake for data: it is `absent`, and a consumer reaches the
 * value only through `status === "present"`.
 */

export type NetworkRead<T> =
    | { readonly status: "pending" }
    | { readonly status: "absent" }
    | { readonly status: "present"; readonly value: T };

export const PENDING: NetworkRead<never> = Object.freeze({ status: "pending" as const });
export const ABSENT: NetworkRead<never> = Object.freeze({ status: "absent" as const });

export function present<T>(value: T): NetworkRead<T> {
    return { status: "present", value };
}

/** Map a present read's value; pending and absent pass through. */
export function mapRead<T, U>(read: NetworkRead<T>, fn: (value: T) => U): NetworkRead<U> {
    return read.status === "present" ? present(fn(read.value)) : read;
}

/** A wagmi / TanStack query as a `NetworkRead`: `success` is `present`, a
 *  query that errored is `absent`, and one still pending (or disabled) is
 *  `pending`. The bridge for chain reads made through `useReadContract`. */
export function queryRead<T>(query: { status: "pending" | "error" | "success"; data: T | undefined }): NetworkRead<T> {
    if (query.status === "error") return ABSENT;
    if (query.status === "success" && query.data !== undefined) return present(query.data);
    return PENDING;
}

/** Run one read: a resolved value is `present`, a throw is `absent` (warned
 *  under `label`, never surfaced). */
export async function readNetwork<T>(label: string, load: () => Promise<T>): Promise<NetworkRead<T>> {
    try {
        return present(await load());
    } catch (err) {
        console.warn(`[${label}] network read failed:`, err);
        return ABSENT;
    }
}
