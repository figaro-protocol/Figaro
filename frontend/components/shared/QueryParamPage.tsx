"use client";

/**
 * QueryParamPage — the one shell for a page whose subject rides in a query
 * parameter (a process id, a seller wallet, a design's slug). The subject is an
 * open-world id, so it is read client-side rather than from a build-time route
 * segment: the page prerenders to a static shell and hydrates against chain +
 * IPFS (`docs/FRONTEND.md` § "Static export").
 *
 * `useSearchParams` needs a Suspense boundary for the static-export prerender;
 * `SearchParamsBoundary` is that boundary, with the loading line as its
 * fallback, for a page that reads optional parameters itself.
 *
 * A missing parameter, or one whose shape `validate` refuses, names nothing:
 * the page renders nothing for it (docs/OPEN_WORLD.md § 1 "No fallbacks") —
 * no "No … in URL" copy, and the subject's view never mounts on a value of the
 * wrong shape.
 */

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { isAddress, type Address, type Hex } from "viem";
import { isBytes32Hex } from "@/lib/shared/evm";

export function SearchParamsBoundary({ children }: { children: ReactNode }) {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading…</p>
                </div>
            }
        >
            {children}
        </Suspense>
    );
}

/** A process id or any 32-byte hash. */
export const processIdParam = (value: string): value is Hex => isBytes32Hex(value);
/** A wallet address. */
export const walletParam = (value: string): value is Address => isAddress(value);
/** A design's slug: any non-empty string (drafts and published designs name it freely). */
export const slugParam = (value: string): value is string => value.length > 0;

export interface QueryParamPageProps<Value extends string> {
    /** The query parameter that names the subject. */
    param: string;
    /** The parameter's shape; a value it refuses renders nothing. */
    validate: (value: string) => value is Value;
    children: (value: Value) => ReactNode;
}

export function QueryParamPage<Value extends string>(props: QueryParamPageProps<Value>) {
    return (
        <SearchParamsBoundary>
            <QueryParamRecord {...props} />
        </SearchParamsBoundary>
    );
}

function QueryParamRecord<Value extends string>({ param, validate, children }: QueryParamPageProps<Value>) {
    const value = useSearchParams().get(param);
    if (value === null || !validate(value)) return null;
    return <>{children(value)}</>;
}
