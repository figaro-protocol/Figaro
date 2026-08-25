"use client";

/**
 * The registry doorway a concept page keeps once its inventory moved to
 * `/registries`: the derived-not-stored scaffolding for its family, the agent
 * read path, a DERIVED live count, and the link into the explorer with that
 * family preselected. Reads through the same walletless hooks the explorer
 * uses, so the number a visitor sees here is the number they land on there.
 *
 * The scaffolding paragraphs were hand-maintained twice (`/clauses` and
 * `/assemblies`, character-identical and already drifting on where the "for
 * agents" note pointed); they live here now, keyed by `family`. Whatever is
 * genuinely family-specific — what a clause's article declaration sorts by,
 * what an assembly row is keyed by — stays on the page.
 *
 * `members` carries NO scaffolding by design: /members is a one-subject page
 * (maintainer ruling 2026-08-06) whose only outbound links are the wizard and
 * discovery. It renders the count line alone.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";
import { useRegisteredMembers } from "@/lib/member/useRegisteredMembers";
import type { RegistryFamily } from "@/lib/registries/explorer";

const NOUN: Record<RegistryFamily, [string, string]> = {
    clauses: ["clause", "clauses"],
    assemblies: ["assembly", "assemblies"],
    members: ["member", "members"],
};

const SDK_README = "https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md";

/** Per-family scaffolding: the registry contract whose event stream IS the
 *  inventory, and the repository directory holding the reference set's
 *  canonical source. `null` = this family's page renders the count alone. */
const SCAFFOLDING: Record<
    RegistryFamily,
    { registry: string; event: string; dir: string } | null
> = {
    clauses: { registry: "ClauseRegistry", event: "ClauseRegistered", dir: "clauses" },
    assemblies: { registry: "AssemblyRegistry", event: "AssemblyRegistered", dir: "assemblies" },
    members: null,
};

function useFamilyCount(family: RegistryFamily): number | null {
    const clauses = useAllRegisteredClauses();
    const assemblies = usePublishedAssemblies(undefined);
    const members = useRegisteredMembers();
    return useMemo(() => {
        if (family === "clauses") return clauses.data === null ? null : clauses.data.filter((c) => !c.stakeWithdrawn).length;
        if (family === "assemblies") return assemblies.data === null ? null : assemblies.data.length;
        return members.data === null ? null : members.data.filter((m) => !m.stakeWithdrawn).length;
    }, [family, clauses.data, assemblies.data, members.data]);
}

export function RegistryCountLink({ family }: { family: RegistryFamily }) {
    const count = useFamilyCount(family);
    const [one, many] = NOUN[family];
    const scaffolding = SCAFFOLDING[family];
    return (
        <>
            {scaffolding && (
                <>
                    <p className="text-sm text-ink-muted leading-relaxed mb-6">
                        There is no static roster of {many} &mdash; this count is not a curated
                        list: it is derived, never stored, read directly off the live network, so
                        it shows exactly what is registered today, nothing more and nothing less.
                        The reference set&apos;s canonical source is the{" "}
                        <a
                            href={`https://github.com/figaro-protocol/Figaro/tree/main/${scaffolding.dir}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                        >
                            <code>{scaffolding.dir}/</code> directory
                        </a>{" "}
                        in the repository; on chain, discover every registered {one} (reference or
                        third-party) the same way the registry explorer does &mdash; by reading the{" "}
                        <code>{scaffolding.registry}</code>&apos;s <code>{scaffolding.event}</code>{" "}
                        event stream.
                    </p>
                    <p className="text-sm text-ink-muted leading-relaxed mb-6">
                        For agents: the registry explorer derives from the live{" "}
                        <code>{scaffolding.registry}</code> and can be reconstructed
                        programmatically with <code>reconstructDiscovery()</code> from{" "}
                        <code>@figaro-protocol/sdk</code> &mdash; the call, and the deployment
                        record it takes its addresses from, are in the{" "}
                        <a href={SDK_README} target="_blank" rel="noopener noreferrer" className="underline">
                            SDK README
                        </a>
                        , the canonical integration manual.
                    </p>
                </>
            )}
            <p className="text-sm text-ink-body leading-relaxed" data-testid={`registry-count-${family}`}>
                {count === null ? (
                    <>Reading the registry&hellip;</>
                ) : (
                    <>
                        {count} {count === 1 ? `${one} is` : `${many} are`} registered with a live stake on the
                        network this site reads.
                    </>
                )}{" "}
                <Link href={`/registries?family=${family}`} className="text-ink-heading hover:underline">
                    Search the registry &rarr;
                </Link>
            </p>
        </>
    );
}
