"use client";

/**
 * PublishedList — renders one address's published assemblies: the connected
 * wallet's, or the one `?wallet=0x…` names (`OneAddressList`); with neither,
 * the list's place says so and reads nothing.
 *
 * Reads from `useAssemblyChoices(subject)` which combines the
 * `ProcessRegistered` event log with a lazy hydrated read (name,
 * order count, clause set). The same hook backs the member-profile
 * assembly picker, so the two surfaces can't drift on what they show
 * about an assembly.
 *
 * Each row has a Fork button (re-uses the hydrated assembly the hook already
 * fetched) and an Inspect link to /view/[slug]. States are
 * `RegistryListState`'s: loading, failed (nothing), empty, list. A fork is a
 * local draft, signed by no one, so it is offered whoever's list it is.
 */

import { useCallback, useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import Link from "@/components/shared/Link";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import {
    type AssemblyChoice,
    useAssemblyChoices,
} from "@/lib/registries/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { forkPublishedAssembly } from "@/lib/designer/forkAssembly";
import { truncateHex } from "@/lib/shared/formatHex";
import { OneAddressList, RegistryListState, type ListedAddress } from "@/components/shared/RegistryListState";

export function PublishedList() {
    return (
        <OneAddressList testId="published" what="published assemblies" publicHref="/registries?family=assemblies">
            {(listed) => <PublishedOf {...listed} />}
        </OneAddressList>
    );
}

function PublishedOf({ subject, signer }: ListedAddress) {
    const router = useRouter();
    const { read } = useAssemblyChoices(subject);
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
            loading="Loading registered assemblies…"
            empty={signer
                ? "You haven't published any assemblies yet. Publish a draft from the designer to see it here."
                : "This address has published no assemblies."}
        >
            {(data) => (
        <ul className="space-y-3" data-testid="published-list">
            {data.map((choice) => (
                <li
                    key={`${choice.processDesignHash}-${choice.blockNumber.toString()}`}
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
                            content <span title={choice.processDesignHash}>{truncateHex(choice.processDesignHash, { head: 10, tail: 6 })}</span>
                            {" · block "}
                            {choice.blockNumber.toString()}
                        </p>
                        <p className="text-[11px] text-ink-muted mt-0.5 break-all">{choice.contentURI}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="compact"
                            onClick={() => handleFork(choice)}
                            disabled={forking !== null || choice.state !== "loaded"}
                            className="py-1.5 rounded border-ink-heading disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid={`published-fork-${choice.slug}`}
                        >
                            {forking === choice.slug ? "Forking…" : "Fork"}
                        </Button>
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

