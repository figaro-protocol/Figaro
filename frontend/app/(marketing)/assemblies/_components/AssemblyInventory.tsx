"use client";

import {
    formatAssemblySchemaList,
    useAssemblyChoices,
} from "@/lib/mechanisms/useAssemblyRegistry";

function truncateAddress(addr: `0x${string}`): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * The `/assemblies` inventory, read live from `AssemblyRegistry`.
 *
 * Reuses `useAssemblyChoices` — the same composition the seller profile
 * and the designer's published-list consume. Each row's identity (slug,
 * author, content hash) is on-chain; the manifest (name, order count,
 * schemas) fetches lazily from IPFS per row.
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
                most-recent first. Each slug is permanent and first-write-wins; manifest
                content fetches lazily from IPFS.
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
                        {choice.state === "loading" && (
                            <p className="text-xs text-ink-muted">Loading manifest&hellip;</p>
                        )}
                        {choice.state === "error" && (
                            <p className="text-xs text-amber-700">
                                Manifest unavailable (IPFS gateway?); on-chain identity is recorded regardless.
                            </p>
                        )}
                        {choice.state === "loaded"
                            && choice.orderCount !== null
                            && choice.schemas !== null && (
                                <p className="text-xs text-ink-body">
                                    {choice.orderCount} order{choice.orderCount === 1 ? "" : "s"}
                                    {" · "}
                                    {choice.schemas.length} schema{choice.schemas.length === 1 ? "" : "s"}
                                    {choice.schemas.length > 0 && `: ${formatAssemblySchemaList(choice.schemas)}`}
                                </p>
                            )}
                        <p className="text-xs text-ink-muted">
                            Author <code className="font-mono">{truncateAddress(choice.author)}</code>
                        </p>
                    </li>
                ))}
            </ul>
        </>
    );
}
