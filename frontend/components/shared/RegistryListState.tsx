"use client";

/**
 * RegistryListState — the one ladder a wallet-scoped registration list renders
 * through: mounted → wallet → failed → loading → empty → rows.
 *
 * Mounted first (`useMounted`, so the server render and the first client render
 * agree), then the wallet: a disconnected visitor sees the list's one-line hint,
 * never a connect button (the page carries its own). Then the registry read:
 *  - failed: nothing. A failed read surfaces nothing for what it would have
 *    shown (docs/OPEN_WORLD.md § 1 "No fallbacks") — no error text and never
 *    the empty-state sentence, which would claim the chain returned nothing.
 *  - in flight (or not yet started): the loading line.
 *  - resolved empty: the list's empty state.
 *  - rows: the list's own rendering.
 *
 * `rows` narrows the read's data when a list shows a subset of it (e.g. the
 * connected wallet's own registrations); it defaults to the data itself.
 */

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";

interface RegistryListRead<Row> {
    data: Row[] | null;
    isLoading: boolean;
    failed: boolean;
}

export interface RegistryListStateProps<Row> {
    read: RegistryListRead<Row>;
    /** Prefix of the state test ids: `${testId}-no-wallet`, `-loading`, `-empty`. */
    testId: string;
    /** Why the list needs a wallet. */
    walletHint: string;
    /** The in-flight line. */
    loading: ReactNode;
    /** The resolved-empty state. */
    empty: ReactNode;
    /** A narrowing of `read.data` the list renders instead of the whole of it. */
    rows?: Row[];
    children: (rows: Row[]) => ReactNode;
}

export function RegistryListState<Row>({
    read,
    testId,
    walletHint,
    loading,
    empty,
    rows,
    children,
}: RegistryListStateProps<Row>) {
    const mounted = useMounted();
    const { address } = useAccount();
    if (!mounted) return null;
    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-no-wallet`}>
                {walletHint}
            </p>
        );
    }
    return (
        <RegistryReadLadder read={read} testId={testId} loading={loading} empty={empty} rows={rows}>
            {children}
        </RegistryReadLadder>
    );
}

function RegistryReadLadder<Row>({
    read,
    testId,
    loading,
    empty,
    rows,
    children,
}: Omit<RegistryListStateProps<Row>, "walletHint">) {
    if (read.failed) return null;
    if (read.isLoading || read.data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-loading`}>
                {loading}
            </p>
        );
    }
    const shown = rows ?? read.data;
    if (shown.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid={`${testId}-empty`}>
                {empty}
            </p>
        );
    }
    return <>{children(shown)}</>;
}
