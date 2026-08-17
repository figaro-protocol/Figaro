"use client";

/**
 * The one line a concept page keeps once its inventory moved to
 * `/registries`: a DERIVED live count for its family and the link into the
 * explorer with that family preselected. Reads through the same walletless
 * hooks the explorer uses, so the number a visitor sees here is the number
 * they land on there.
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
    return (
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
    );
}
