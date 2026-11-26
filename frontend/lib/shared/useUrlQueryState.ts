"use client";

/**
 * useUrlQueryState — the URL query IS a page's state.
 *
 * The explorer pages parse the live query into their state and write every
 * change back with `router.replace`, so each view is a permalink and the
 * back button never fills with filter keystrokes. `merge` folds a patch into
 * the current state; the default is a plain spread, and a page whose patch
 * resets other keys passes its own.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The plain spread: the patch's keys over the current state. */
function spreadPatch<Q>(state: Q, patch: Partial<Q>): Q {
    return { ...state, ...patch };
}

/** `parse`, `serialize` and `merge` are module-level functions, so the
 *  returned setter keeps its identity across renders. */
export function useUrlQueryState<Q>(
    parse: (params: URLSearchParams) => Q,
    serialize: (state: Q) => string,
    merge: (state: Q, patch: Partial<Q>) => Q = spreadPatch,
): [Q, (patch: Partial<Q>) => void] {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const state = useMemo(() => parse(params), [parse, params]);
    const setState = useCallback(
        (patch: Partial<Q>) => {
            router.replace(`${pathname}?${serialize(merge(state, patch))}`, { scroll: false });
        },
        [state, router, pathname, serialize, merge],
    );
    return [state, setState];
}
