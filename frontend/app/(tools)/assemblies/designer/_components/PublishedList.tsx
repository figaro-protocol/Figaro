"use client";

/**
 * PublishedList — renders the connected wallet's published assemblies.
 *
 * Reads from `useAssemblyChoices(address)` which combines the
 * `AssemblyRegistered` event log with a lazy hydrated read (name,
 * order count, clause set). The same hook backs the member-profile
 * assembly picker, so the two surfaces can't drift on what they show
 * about an assembly.
 *
 * Each row has a Fork button (re-uses the hydrated assembly the hook already
 * fetched) and an Inspect link to /view/[slug]. States are
 * `RegistryListState`'s: wallet, loading, failed (nothing), empty, list.
 */

import { useCallback, useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import Link from "@/components/shared/Link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
    type AssemblyChoice,
    useAssemblyChoices,
} from "@/lib/protocol/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { forkPublishedAssembly } from "@/lib/designer/forkAssembly";
import { truncateHex } from "@/lib/shared/formatHex";
import { RegistryListState } from "@/components/shared/RegistryListState";

export function PublishedList() {
    const router = useRouter();
    const { address } = useAccount();
    const read = useAssemblyChoices(address);
    const [forking, setForking] = useState<string | null>(null);

    const handleFork = useCallback(
        async (choice: AssemblyChoice) => {
            if (choice.state !== "loaded" || !choice.hydratedAssembly) {
                window.alert(
                    `Content for "${choice.slug}" is not yet available. Wait for it to load (or check the IPFS gateway) before forking.`,
                );
                return;
            }
            setForking(choice.slug);
            try {
                const outcome = forkPublishedAssembly(choice.slug, choice.hydratedAssembly);
                router.push(`/assemblies/designer/edit?slug=${encodeURIComponent(outcome.finalSlug)}`);
            } catch (err) {
                const message = extractErrorMessage(err, "Loading the published assemblies failed.");
                window.alert(`Fork failed: ${message}`);
            } finally {
                setForking(null);
            }
        },
        [router],
    );

    return (
        <RegistryListState
            read={read}
            testId="published"
            walletHint="Connect a wallet to see your published assemblies."
            loading="Loading registered assemblies…"
            empty="You haven't published any assemblies yet. Publish a draft from the designer to see it here."
        >
            {(data) => (
        <ul className="space-y-3" data-testid="published-list">
            {data.map((choice) => (
                <li
                    key={`${choice.assemblyHash}-${choice.blockNumber.toString()}`}
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                    data-testid={`published-row-${choice.slug}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-ink-heading truncate">
                            {choice.name}
                        </p>
                        <p className="font-mono text-[11px] text-ink-muted mt-0.5">
                            /{choice.slug}
                        </p>
                        <AssemblyShapeLine
                            choice={choice}
                            className="text-[11px] mt-1"
                            testId={`published-shape-${choice.slug}`}
                        />
                        <p className="font-mono text-[11px] text-ink-muted mt-1">
                            content <span title={choice.assemblyHash}>{truncateHex(choice.assemblyHash, { head: 10, tail: 6 })}</span>
                            {" · block "}
                            {choice.blockNumber.toString()}
                        </p>
                        <p className="text-[11px] text-ink-muted mt-0.5 break-all">{choice.contentURI}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleFork(choice)}
                            disabled={forking !== null || choice.state !== "loaded"}
                            className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-primary disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid={`published-fork-${choice.slug}`}
                        >
                            {forking === choice.slug ? "Forking…" : "Fork"}
                        </button>
                        <Link
                            href={`/assemblies/designer/view?slug=${encodeURIComponent(choice.slug)}`}
                            className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-body text-center"
                            data-testid={`published-inspect-${choice.slug}`}
                        >
                            Inspect
                        </Link>
                    </div>
                </li>
            ))}
        </ul>
            )}
        </RegistryListState>
    );
}

