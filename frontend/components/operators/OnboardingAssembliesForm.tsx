"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import type { AssemblyBindingRecord } from "@/lib/shared/runtimeIdentity";
import {
    type AssemblyChoice,
    formatAssemblySchemaList,
    useAssemblyChoices,
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

function buildBinding(
    wallet: `0x${string}`,
    choice: AssemblyChoice,
): AssemblyBindingRecord {
    return {
        bindingId: `binding:${wallet.toLowerCase()}:${choice.slug}`,
        subjectAddress: wallet,
        assemblySlug: choice.slug,
        networkTargets: [...choice.networkTargets],
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
    const { state, loaded, update } = useOnboardingState(address);

    // On-chain published assemblies (all authors). Same hook backs the
    // designer's PublishedList — keeps "what an operator sees about an
    // assembly" aligned with "what the assembly's author sees" on a
    // single source.
    const { data: choicesData } = useAssemblyChoices();
    const choices: AssemblyChoice[] = choicesData ?? [];

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
                            data-testid={`operator-assembly-row-${choice.slug}`}
                        >
                            <div className="flex items-start gap-3">
                                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggle(choice.slug)}
                                        className="mt-1 accent-accent"
                                    />
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-semibold text-ink-heading truncate">
                                                {choice.name}
                                            </span>
                                            <code className="text-xs text-ink-faint font-mono shrink-0">
                                                {choice.slug}
                                            </code>
                                        </div>
                                        {choice.state === "loading" && (
                                            <p className="text-[11px] text-ink-faint">Loading manifest…</p>
                                        )}
                                        {choice.state === "error" && (
                                            <p className="text-[11px] text-amber-700">
                                                Manifest unavailable (IPFS gateway?). Identity is on-chain regardless.
                                            </p>
                                        )}
                                        {choice.state === "loaded" && choice.orderCount !== null && choice.schemas !== null && (
                                            <p
                                                className="text-xs text-ink-body"
                                                title={choice.schemas.join(", ")}
                                                data-testid={`operator-assembly-shape-${choice.slug}`}
                                            >
                                                {choice.orderCount} order{choice.orderCount === 1 ? "" : "s"}
                                                {" · "}
                                                {choice.schemas.length} schema{choice.schemas.length === 1 ? "" : "s"}
                                                {choice.schemas.length > 0 && `: ${formatAssemblySchemaList(choice.schemas)}`}
                                            </p>
                                        )}
                                        <p className="text-xs text-ink-faint">
                                            Networks: {choice.networkTargets.join(", ")}
                                        </p>
                                    </div>
                                </label>
                                <Link
                                    href={`/builders/designer/view/${encodeURIComponent(choice.slug)}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center shrink-0"
                                    data-testid={`operator-assembly-inspect-${choice.slug}`}
                                >
                                    Inspect ↗
                                </Link>
                            </div>
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
