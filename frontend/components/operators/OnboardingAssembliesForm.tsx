"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { REFERENCE_ASSEMBLIES, type Assembly } from "@/lib/shared/assembly";
import type { AssemblyBindingRecord } from "@/lib/shared/runtimeIdentity";
import {
    useAllPublishedAssemblies,
    fetchAssemblyManifest,
    chainIdToNetworkTarget,
} from "@/lib/mechanisms/useAssemblyRegistry";

/**
 * Step 5 of the onboarding wizard. Lets the operator pick which
 * assemblies they participate in. Each selected assembly becomes an
 * `AssemblyBindingRecord` on `state.assemblies` with the wallet as
 * `subjectAddress` and the assembly's `networkTargets`.
 *
 * Per-assembly per-seller customization (trusted-counterparty
 * addresses, mechanism configuration) is deferred to a later
 * iteration. This step ships the multi-select; downstream surfaces
 * (the operator-edit page, follow-up commits) handle the granular
 * config. The user can re-enter the wizard or use the operator-edit
 * surface to refine.
 *
 * It's valid to ship without picking any assemblies — an unbound
 * operator is still on-chain registered and reachable; their bindings
 * just don't surface to assembly-scoped discovery.
 */

interface AssemblyChoice {
    slug: string;
    name: string;
    description: string;
    networkTargets: readonly string[];
    /** Where this choice was sourced from. Drives the badge + de-duplication. */
    source: "reference" | "on-chain";
}

function describeAssembly(assembly: Assembly): AssemblyChoice {
    return {
        slug: assembly.identity.slug,
        name: assembly.identity.name,
        description: assembly.identity.description ?? "",
        networkTargets: assembly.identity.networkTargets,
        source: "reference",
    };
}

function buildBinding(
    wallet: `0x${string}`,
    assembly: AssemblyChoice,
): AssemblyBindingRecord {
    return {
        bindingId: `binding:${wallet.toLowerCase()}:${assembly.slug}`,
        subjectAddress: wallet,
        assemblySlug: assembly.slug,
        networkTargets: [...assembly.networkTargets],
        roleBindings: [],
        version: "1.0.0",
    };
}

export interface OnboardingAssembliesFormProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(bindings)` instead of routing to the next wizard step.
     * The caller re-pins the operator profile with the updated
     * `assemblyBindings` array and dispatches `updateProfile`.
     */
    onSave?: (bindings: AssemblyBindingRecord[]) => Promise<void>;
    /** Submit-button label override. Defaults to "Next →". */
    submitLabel?: string;
    /** Back-link href override. Defaults to "/operators/onboard/link". */
    backHref?: string;
    /** Back-link label override. Defaults to "← Back". */
    backLabel?: string;
    /** Whether the submit is currently in flight. Suppresses double-submission. */
    submitInFlight?: boolean;
    /** External error from `onSave`. */
    externalError?: string | null;
}

export function OnboardingAssembliesForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingAssembliesFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { state, loaded, update } = useOnboardingState(address);

    // On-chain published assemblies (all authors). Manifest fetch lands
    // name/description from IPFS; networkTargets is derived from the
    // current chain since the registry is per-chain.
    const { data: publishedEvents } = useAllPublishedAssemblies();
    const [onChainChoices, setOnChainChoices] = useState<AssemblyChoice[]>([]);

    useEffect(() => {
        if (!publishedEvents || publishedEvents.length === 0) {
            setOnChainChoices([]);
            return;
        }
        let cancelled = false;
        const networkTarget = chainIdToNetworkTarget(chainId);
        Promise.all(
            publishedEvents.map(async (event) => {
                const manifest = await fetchAssemblyManifest(event.metadataURI);
                return {
                    slug: event.slug,
                    name: manifest?.name ?? event.slug,
                    description: manifest?.description ?? "",
                    networkTargets: [networkTarget],
                    source: "on-chain" as const,
                };
            }),
        ).then((items) => {
            if (cancelled) return;
            setOnChainChoices(items);
        });
        return () => {
            cancelled = true;
        };
    }, [publishedEvents, chainId]);

    // Merge sources, de-dupe by slug (on-chain wins if both exist).
    const choices = useMemo<AssemblyChoice[]>(() => {
        const merged = new Map<string, AssemblyChoice>();
        for (const ref of REFERENCE_ASSEMBLIES) merged.set(ref.identity.slug, describeAssembly(ref));
        for (const onChain of onChainChoices) merged.set(onChain.slug, onChain);
        return Array.from(merged.values());
    }, [onChainChoices]);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [hydrated, setHydrated] = useState(false);

    // Hydrate once `loaded === true` (the wallet-keyed state has
    // actually been read from localStorage). See the matching comment
    // in OnboardingProfileForm for the race this avoids.
    useEffect(() => {
        if (hydrated || !loaded) return;
        const existing = state.assemblies ?? [];
        setSelected(new Set(existing.map((b) => b.assemblySlug)));
        setHydrated(true);
    }, [hydrated, loaded, state.assemblies]);

    // Persist on every change.
    useEffect(() => {
        if (!hydrated || !isConnected || !address) return;
        const bindings = choices
            .filter((c) => selected.has(c.slug))
            .map((c) => buildBinding(address, c));
        update({ assemblies: bindings });
    }, [selected, hydrated, isConnected, address, choices, update]);

    function toggle(slug: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    }

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        if (onSave) {
            if (!address) return;
            const bindings = choices
                .filter((c) => selected.has(c.slug))
                .map((c) => buildBinding(address, c));
            onSave(bindings).catch(() => {
                // Caller surfaces the error via `externalError`.
            });
            return;
        }
        router.push("/operators/onboard/agents");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to load your assembly bindings draft.
                </p>
                <Link href="/operators/onboard/profile">
                    <Button variant="outline">← Back</Button>
                </Link>
            </Card>
        );
    }

    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Pick the assemblies you participate in. Each binding
                    publishes onto your profile as part of the document pinned
                    in step 7. You can leave this empty and add assemblies
                    later through the operator-edit surface; an unbound
                    operator is still on-chain registered.
                </p>
                <p>
                    Per-assembly customization — trusted counterparty
                    addresses (e.g. couriers you work with), mechanism
                    configuration where the assembly asks for it — is added
                    after first registration.
                </p>
            </Card>

            <div className="space-y-3">
                {choices.map((choice) => {
                    const isSelected = selected.has(choice.slug);
                    return (
                        <Card
                            key={choice.slug}
                            className={`p-4 transition-colors ${isSelected ? "border-ink-heading" : ""}`}
                        >
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggle(choice.slug)}
                                    className="mt-1"
                                />
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="font-semibold text-ink-heading">
                                            {choice.name}
                                        </span>
                                        <div className="flex items-baseline gap-2 shrink-0">
                                            <span
                                                className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 ${
                                                    choice.source === "on-chain"
                                                        ? "bg-ink-heading text-paper"
                                                        : "bg-subtle text-ink-muted"
                                                }`}
                                                data-testid={`assembly-source-${choice.slug}`}
                                            >
                                                {choice.source}
                                            </span>
                                            <code className="text-xs text-ink-faint font-mono">
                                                {choice.slug}
                                            </code>
                                        </div>
                                    </div>
                                    {choice.description && (
                                        <p className="text-sm text-ink-body">
                                            {choice.description}
                                        </p>
                                    )}
                                    <p className="text-xs text-ink-faint">
                                        Networks: {choice.networkTargets.join(", ")}
                                    </p>
                                </div>
                            </label>
                        </Card>
                    );
                })}
            </div>

            {externalError && (
                <p className="text-sm text-red-600" role="alert">{externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/operators/onboard/link"}
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    {backLabel ?? "← Back"}
                </Link>
                <Button type="submit" disabled={submitInFlight}>
                    {submitInFlight ? "Saving…" : (submitLabel ?? "Next →")}
                </Button>
            </div>
        </form>
    );
}
