"use client";

import { useMemo } from "react";
import { keccak256, toBytes } from "viem";
import { useAllRegisteredClauses } from "@/lib/mechanisms/useClauseRegistry";
import { CLAUSES_BY_ARTICLE } from "@/lib/shared/clauseSpecSource";

/** keccak256 of a human-readable clauseId — the on-chain digest, matching
 *  Solidity's `keccak256("figaro-foo-v1")`. */
function clauseIdHash(clauseId: string): string {
    return keccak256(toBytes(clauseId)).toLowerCase();
}

/**
 * The `/clauses` inventory, read live from `ClauseRegistry`.
 *
 * The on-chain `ClauseRegistered` event set is the source of truth for WHICH
 * clauses exist. The bundled spec source (`CLAUSES_BY_ARTICLE`) is only the
 * content store — it supplies each registered clause's title, description,
 * and the article it groups under. A clause registered on-chain whose spec
 * this build does not carry is counted, not named.
 *
 * This is a client component because the marketing tier mounts no wallet
 * provider; `useAllRegisteredClauses` reads through the standalone viem
 * client. The page that embeds it stays a server component — it keeps the
 * route metadata and the static prose.
 */
export function ClauseInventory() {
    const { data } = useAllRegisteredClauses();

    const inventory = useMemo(() => {
        if (data === null) return null;
        const onChain = new Set(data.map((e) => e.clauseIdHash.toLowerCase()));
        const articles = CLAUSES_BY_ARTICLE.map((group) => ({
            article: group.article,
            label: group.label,
            clauses: group.clauses.filter((s) => onChain.has(clauseIdHash(s.clauseId))),
        })).filter((group) => group.clauses.length > 0);
        const liveKnown = articles.reduce((n, g) => n + g.clauses.length, 0);
        const knownHashes = new Set(
            CLAUSES_BY_ARTICLE.flatMap((g) => g.clauses.map((s) => clauseIdHash(s.clauseId))),
        );
        const unbundled = data.filter(
            (e) => !knownHashes.has(e.clauseIdHash.toLowerCase()),
        ).length;
        return { articles, liveKnown, unbundled, total: data.length };
    }, [data]);

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
            <div className="space-y-8">
                {articles.map((group) => (
                    <div key={group.article}>
                        <h3 className="text-base font-semibold text-ink-heading mb-3">
                            {group.label}
                        </h3>
                        <ul className="space-y-3">
                            {group.clauses.map((clause) => (
                                <li
                                    key={clause.clauseId}
                                    id={`clause-${clause.clauseId}`}
                                    className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24"
                                >
                                    <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0">
                                        {clause.clauseId}
                                    </span>
                                    <span className="text-sm text-ink-body">
                                        {clause.description}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </>
    );
}
