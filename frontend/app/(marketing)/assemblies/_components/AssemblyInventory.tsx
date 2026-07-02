"use client";

import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { truncateHex } from "@/lib/shared/formatHex";

/**
 * The `/assemblies` inventory, read live from `AssemblyRegistry`.
 *
 * Reuses `useAssemblyChoices` — the same composition the seller profile
 * and the designer's published-list consume. Each row's identity (slug,
 * author, content hash) is on-chain; the assembly template (name, order count,
 * clauses) fetches lazily from IPFS per row.
 *
 * Client component because the marketing tier mounts no wallet provider.
 * The read hook reads through the standalone viem client now that
 * `useAssemblyRegistry` no longer depends on wagmi's `usePublicClient`.
 */
export function AssemblyInventory() {
    const { data } = useAssemblyChoices();

    if (data === null) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">Reading the registry&hellip;</p>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">
                No assemblies are registered on the network this site is reading. This
                inventory is event-driven &mdash; it populates from{" "}
                <code>AssemblyRegistry</code> as authors publish.
            </p>
        );
    }

    return (
        <>
            <p className="text-sm text-ink-body leading-relaxed mb-6">
                {data.length}{" "}
                {data.length === 1 ? "assembly is" : "assemblies are"} registered on{" "}
                <code>AssemblyRegistry</code>, read live from{" "}
                <code>AssemblyRegistered</code> events &mdash; the on-chain set, sorted
                most-recent first. Each slug is permanent and first-write-wins;
                assembly-template content fetches lazily from IPFS.
            </p>
            <ul className="space-y-5">
                {data.map((choice) => (
                    <li
                        key={choice.contentHash}
                        id={`assembly-${choice.slug}`}
                        className="flex flex-col gap-1 scroll-mt-24"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                            <span className="text-sm font-semibold text-ink-heading">
                                {choice.name}
                            </span>
                            <code className="font-mono text-xs text-ink-muted">
                                {choice.slug}
                            </code>
                        </div>
                        <AssemblyShapeLine choice={choice} />
                        <p className="text-xs text-ink-muted">
                            Author <code className="font-mono">{truncateHex(choice.author)}</code>
                        </p>
                    </li>
                ))}
            </ul>
        </>
    );
}
