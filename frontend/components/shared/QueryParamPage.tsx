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
 * A missing parameter, or one whose shape `validate` refuses, names no
 * subject: the subject's view never mounts on it, and the page's place says in
 * one line what the page shows and that its address names none, the way
 * `/orders` says its list is one address's and none is named
 * (docs/FRONTEND.md § "The wallet is a signer, never a login"). No read
 * starts and no default subject stands in (docs/OPEN_WORLD.md § 1 "No
 * fallbacks").
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
    /** The parameter's shape; a value it refuses names no subject. */
    validate: (value: string) => value is Value;
    /** What the page shows, as the end of "This page shows …": the one line a
     *  visit that names no subject reads. */
    shows: string;
    children: (value: Value) => ReactNode;
}

export function QueryParamPage<Value extends string>(props: QueryParamPageProps<Value>) {
    return (
        <SearchParamsBoundary>
            <QueryParamRecord {...props} />
        </SearchParamsBoundary>
    );
}

function QueryParamRecord<Value extends string>({ param, validate, shows, children }: QueryParamPageProps<Value>) {
    const value = useSearchParams().get(param);
    if (value === null || !validate(value)) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-ink-muted" data-testid="query-param-none">
                    This page shows {shows}, and its address names none: add <code>?{param}=…</code> to it.
                </p>
            </div>
        );
    }
    return <>{children(value)}</>;
}
