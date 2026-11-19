import type { TruthBoundary } from "@figaro-protocol/sdk/derive";

/**
 * One row's truth boundary: what backs the row, in the SDK's closed vocabulary
 * (`TruthBoundary`, `sdk/src/derive/truth.ts`; docs/DATA_LAYER.md § "Truth
 * boundaries"), and, where given, where the row was read from: a row derived at
 * read time from events, or a row read from a party's own content, says so.
 * Every page that lists rows of the public data carries one per row, so a
 * declaration never reads as a guarantee.
 */
export function RowBoundary({ boundary, source }: { boundary: TruthBoundary; source?: string }) {
    return (
        <span className="block text-xs text-ink-muted">
            <span className="font-mono" data-testid="row-boundary">{boundary}</span>
            {source ? (
                <>
                    {" "}&middot; <span data-testid="row-source">{source}</span>
                </>
            ) : null}
        </span>
    );
}
