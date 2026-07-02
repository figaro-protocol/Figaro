"use client";

import { useMemo } from "react";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { groupClausesByArticle } from "@/lib/shared/clauseSpecSource";
import { ClausesByArticle } from "@/components/core/ClausesByArticle";

/**
 * The `/clauses` inventory, read live from `ClauseRegistry` → IPFS.
 *
 * The on-chain `ClauseRegistered` event set is the source of truth for WHICH
 * clauses exist; `useClauseSpecs` fetches each clause's spec from its on-chain
 * `metadataURI` and groups them by article. Nothing is bundled — a clause whose
 * spec the gateway can't serve is registered, counted, but not named.
 *
 * This is a client component because the marketing tier mounts no wallet
 * provider; the reads go through the standalone viem client + the IPFS gateway.
 * The page that embeds it stays a server component.
 */
export function ClauseInventory() {
    const { data } = useAllRegisteredClauses();
    const { loadedCount, version } = useClauseSpecs();

    const inventory = useMemo(() => {
        if (data === null) return null;
        // Every loaded spec came from an on-chain event → group them by article.
        const articles = groupClausesByArticle();
        const liveKnown = articles.reduce((n, g) => n + g.clauses.length, 0);
        const unbundled = data.length - liveKnown; // registered, spec not (yet) resolvable
        return { articles, liveKnown, unbundled, total: data.length };
        // `version` bumps as specs resolve, so the grouping recomputes once warm.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, version, loadedCount]);

    if (inventory === null) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">Reading the registry&hellip;</p>
        );
    }

    if (inventory.total === 0) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">
                No clauses are registered on the network this site is reading. This
                inventory is event-driven &mdash; it populates from{" "}
                <code>ClauseRegistry</code> once a deployment is reachable.
            </p>
        );
    }

    if (inventory.articles.length === 0) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">
                {inventory.total}{" "}
                {inventory.total === 1 ? "clause is" : "clauses are"} registered on{" "}
                <code>ClauseRegistry</code>, none of whose specs this build carries.
            </p>
        );
    }

    const { articles, liveKnown, unbundled } = inventory;

    return (
        <>
            <p className="text-sm text-ink-body leading-relaxed mb-6">
                {liveKnown} {liveKnown === 1 ? "clause is" : "clauses are"} registered on{" "}
                <code>ClauseRegistry</code> across {articles.length}{" "}
                {articles.length === 1 ? "article" : "articles"}, read live from on-chain{" "}
                <code>ClauseRegistered</code> events &mdash; exactly what the connected
                network holds, not a bundled copy.
                {unbundled > 0 ? (
                    <>
                        {" "}
                        A further {unbundled}{" "}
                        {unbundled === 1 ? "clause is" : "clauses are"} registered whose
                        spec this build does not carry, shown here only as a count.
                    </>
                ) : null}
            </p>
            <ClausesByArticle
                sections={articles.map((g) => ({ article: g.article, label: g.label, items: g.clauses }))}
                rootClassName="space-y-8"
                listClassName="space-y-3"
                renderHeading={(label) => (
                    <h3 className="text-base font-semibold text-ink-heading mb-3">{label}</h3>
                )}
                renderClause={(clause) => (
                    <li
                        key={clause.clauseId}
                        id={`clause-${clause.clauseId}`}
                        className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24"
                    >
                        <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0">
                            {clause.clauseId}
                        </span>
                        <span className="text-sm text-ink-body">{clause.description}</span>
                    </li>
                )}
            />
        </>
    );
}
