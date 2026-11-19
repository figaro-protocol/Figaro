"use client";

import { useState } from "react";

/**
 * True on the first render, and on each render where one of `deps` differs
 * (`Object.is`) from the previous render's — the same comparison an effect's
 * dependency array makes.
 *
 * It is React's "adjusting some state when a prop changes"
 * (react.dev/learn/you-might-not-need-an-effect): a component that must reset
 * its own state when an input changes does it during render, inside
 * `if (useDepsChanged([...]))`, and React re-renders before committing. The
 * reset that an effect would make one commit later, after a frame with the
 * old state painted, is made before that frame. The effect keeps only the
 * work that waits on something outside React (a fetch, a subscription).
 *
 * Every dep must be stable across renders when unchanged, as an effect's must:
 * a dep rebuilt on every render never comes to rest.
 */
export function useDepsChanged(deps: readonly unknown[]): boolean {
    const [prev, setPrev] = useState<readonly unknown[] | null>(null);
    const changed = prev === null || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]));
    if (changed) setPrev(deps);
    return changed;
}
