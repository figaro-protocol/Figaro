"use client";

import {
    type AssemblyChoice,
    formatAssemblyClauseList,
} from "@/lib/designer/assemblyDiscovery";

/**
 * AssemblyShapeLine — the one-line summary of an assembly's shape, shared by
 * every surface that lists `AssemblyChoice`s: the `/assemblies` inventory, the
 * designer's published list, and the seller-onboarding assembly picker. It
 * renders the lazy IPFS-hydration states so those surfaces cannot drift on how
 * an assembly is described.
 *
 *   loading → "Loading assembly content…"
 *   error   → "Document unavailable …"  (the on-chain identity still rendered)
 *   loaded  → "N orders · M clauses: <clause list>"
 *
 * `className` carries surface-specific size/spacing; the state colour is owned
 * here so it stays consistent. `testId` attaches to the loaded line for the
 * surfaces whose specs key off it.
 */
export function AssemblyShapeLine({
    choice,
    className = "text-xs",
    testId,
}: {
    choice: AssemblyChoice;
    className?: string;
    testId?: string;
}) {
    if (choice.state === "loading") {
        return <p className={`${className} text-ink-muted`}>Loading assembly content&hellip;</p>;
    }
    if (choice.state === "error") {
        return (
            <p className={`${className} text-amber-700`}>
                Document unavailable (IPFS gateway?). On-chain identity is recorded regardless.
            </p>
        );
    }
    if (choice.state === "loaded" && choice.orderCount !== null && choice.clauses !== null) {
        return (
            <p className={`${className} text-ink-body`} data-testid={testId} title={choice.clauses.join(", ")}>
                {choice.orderCount} order{choice.orderCount === 1 ? "" : "s"}
                {" · "}
                {choice.clauses.length} clause{choice.clauses.length === 1 ? "" : "s"}
                {choice.clauses.length > 0 && `: ${formatAssemblyClauseList(choice.clauses)}`}
            </p>
        );
    }
    return null;
}
