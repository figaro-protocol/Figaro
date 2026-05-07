"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { REFERENCE_ASSEMBLIES, type Assembly } from "@/lib/shared/assembly";
import type { AssemblyBindingRecord } from "@/lib/shared/runtimeIdentity";

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
}

function describeAssembly(assembly: Assembly): AssemblyChoice {
    return {
        slug: assembly.identity.slug,
        name: assembly.identity.name,
        description: assembly.identity.description ?? "",
        networkTargets: assembly.identity.networkTargets,
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

export function OnboardingAssembliesForm() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { state, update } = useOnboardingState(address);

    const choices = useMemo(() => REFERENCE_ASSEMBLIES.map(describeAssembly), []);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [hydrated, setHydrated] = useState(false);

    // Hydrate from localStorage on mount.
    useEffect(() => {
        if (hydrated || !isConnected) return;
        const existing = state.assemblies ?? [];
        setSelected(new Set(existing.map((b) => b.assemblySlug)));
        setHydrated(true);
    }, [hydrated, state.assemblies, isConnected]);

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
        router.push("/operators/onboard/agents");
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
                                        <code className="text-xs text-ink-faint font-mono">
                                            {choice.slug}
                                        </code>
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

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/operators/onboard/link"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <Button type="submit">Next →</Button>
            </div>
        </form>
    );
}
