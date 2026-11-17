"use client";

/**
 * The registration lists of one address: the assemblies, agreements and
 * clauses a wallet registered, on `/assemblies/designer` and
 * `/clauses/register`.
 *
 * `OneAddressList` names the address. Reading needs no wallet: the address is
 * the connected wallet's, or the one `?wallet=0x…` names (`useViewedWallet`,
 * the helper `/orders` and `/rewards` read it with). With neither, a list that
 * is by definition one address's has nothing to show: its place carries one
 * line saying so, with a link to `/registries`, where every registration is
 * listed. No connect button stands in for content, and the list's per-address
 * read is never started with no address (the registry scans read every
 * registration when given none). Its children receive the address, and the
 * connected wallet when it is that address: only the registrant signs a
 * reclaim, so a list offers one only then.
 *
 * `RegistryListState` is the read's ladder: mounted → failed → loading →
 * empty → rows.
 *  - absent: nothing. A failed read surfaces nothing for what it would have
 *    shown (docs/OPEN_WORLD.md § 1 "No fallbacks") — no error text and never
 *    the empty-state sentence, which would claim the chain returned nothing.
 *  - pending (in flight, or not yet started): the loading line.
 *  - resolved empty: the list's empty state.
 *  - rows: the list's own rendering.
 *
 * `rows` narrows the read's data when a list shows a subset of it (e.g. the
 * address's own registrations); it defaults to the data itself.
 */

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import Link from "@/components/shared/Link";
import { useMounted } from "@/hooks/useMounted";
import { hexEqual } from "@/lib/shared/evm";
import type { NetworkRead } from "@/lib/shared/networkRead";
import { useViewedWallet } from "@/lib/shared/viewedWallet";

/** The address a list shows, and the connected wallet when it is that address. */
export interface ListedAddress {
    subject: `0x${string}`;
    /** The connected wallet, when it is `subject`: the one that may sign. */
    signer: `0x${string}` | undefined;
}

export interface OneAddressListProps {
    /** Prefix of the line's test id: `${testId}-no-address`. */
    testId: string;
    /** What the list holds, in the line: "registered clauses". */
    what: string;
    /** The public list of the same registrations, every registrant's. */
    publicHref: string;
    children: (listed: ListedAddress) => ReactNode;
}

export function OneAddressList({ testId, what, publicHref, children }: OneAddressListProps) {
    const mounted = useMounted();
    const { address } = useAccount();
    const subject = useViewedWallet(address);
    if (!mounted) return null;
    if (!subject) {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-no-address`}>
                These are the {what} of one address, and this page names none: connect a wallet, or
                add <code>?wallet=0x…</code> to the address. Every registrant&apos;s are listed at{" "}
                <Link href={publicHref} className="underline">the registries</Link>.
            </p>
        );
    }
    return <>{children({ subject, signer: hexEqual(address, subject) ? address : undefined })}</>;
}

export interface RegistryListStateProps<Row> {
    read: NetworkRead<Row[]>;
    /** Prefix of the state test ids: `${testId}-loading`, `-empty`. */
    testId: string;
    /** The in-flight line. */
    loading: ReactNode;
    /** The resolved-empty state. */
    empty: ReactNode;
    /** A narrowing of the read's rows the list renders instead of the whole of it. */
    rows?: Row[];
    children: (rows: Row[]) => ReactNode;
}

export function RegistryListState<Row>({
    read,
    testId,
    loading,
    empty,
    rows,
    children,
}: RegistryListStateProps<Row>) {
    const mounted = useMounted();
    if (!mounted) return null;
    if (read.status === "absent") return null;
    if (read.status === "pending") {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-loading`}>
                {loading}
            </p>
        );
    }
    const shown = rows ?? read.value;
    if (shown.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-empty`}>
                {empty}
            </p>
        );
    }
    return <>{children(shown)}</>;
}
