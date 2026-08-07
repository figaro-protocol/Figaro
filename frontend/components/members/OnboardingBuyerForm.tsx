"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/member/onboardingState";
import type {
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
} from "@/lib/member/memberProfileMetadata";
import { type AssemblyChoice, useAssemblyChoices } from "@/lib/protocol/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { DisclosurePolicyEditor } from "@/components/members/DisclosurePolicyEditor";

/**
 * The buyer step of the member wizard. The member SUBSCRIBES the
 * assemblies they buy through — their own list, independent of the
 * seller bindings, because a wallet does not buy through the assemblies
 * it sells through — and toggles which of the data those deals
 * co-produce is offered for sale. Subscribing is the buyer's
 * verb; BINDING stays the seller's.
 *
 * Optional: a member who only sells ships with no subscriptions.
 * Prices never live here — data products are priced as items in the
 * member's own catalogue.
 */

/** Restrict the buyer-posture policy to the data of the
 *  assemblies currently subscribed — unsubscribing drops its rows from
 *  the saved policy (local editor state keeps them, so re-subscribing
 *  within the session restores the configuration). */
function activeBuyerPolicy(
    entries: DisclosurePolicyEntry[],
    subscribedHashes: Set<string>,
): DisclosurePolicyEntry[] {
    return entries.filter((e) => subscribedHashes.has(e.compositionHash));
}

function buildSubscriptions(subscribedHashes: Set<string>): BuyerAssemblySubscription[] {
    return [...subscribedHashes].map((h) => ({ compositionHash: h as `0x${string}` }));
}

export interface OnboardingBuyerFormProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(subscriptions, disclosurePolicy)` instead of routing to
     * the next wizard step. The policy passed is the FULL list (seller
     * entries carried through untouched) so an edit-mode save can't
     * strand one side's declarations.
     */
    onSave?: (
        subscriptions: BuyerAssemblySubscription[],
        disclosurePolicy: DisclosurePolicyEntry[],
    ) => Promise<void>;
    submitLabel?: string;
    backHref?: string;
    backLabel?: string;
    submitInFlight?: boolean;
    externalError?: string | null;
}

export function OnboardingBuyerForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingBuyerFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, loaded, update } = useOnboardingState(address);

    const { data: choicesData } = useAssemblyChoices();
    const choices: AssemblyChoice[] = choicesData ?? [];

    const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
    // This step edits BUYER-posture disclosure entries only (classes
    // derive from the subscriptions). Seller-posture entries belong to
    // the assemblies step and are carried through every write untouched.
    const [policyEntries, setPolicyEntries] = useState<DisclosurePolicyEntry[]>([]);
    const [otherPostureEntries, setOtherPostureEntries] = useState<DisclosurePolicyEntry[]>([]);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated || !loaded) return;
        setSubscribed(new Set((state.buyerAssemblies ?? []).map((s) => s.compositionHash)));
        const allEntries = state.disclosurePolicy ?? [];
        setPolicyEntries(allEntries.filter((e) => e.posture === "buyer"));
        setOtherPostureEntries(allEntries.filter((e) => e.posture !== "buyer"));
        setHydrated(true);
    }, [hydrated, loaded, state.buyerAssemblies, state.disclosurePolicy]);

    useEffect(() => {
        if (!hydrated || !isConnected || !address) return;
        update({
            buyerAssemblies: buildSubscriptions(subscribed),
            disclosurePolicy: [
                ...otherPostureEntries,
                ...activeBuyerPolicy(policyEntries, subscribed),
            ],
        });
    }, [subscribed, policyEntries, otherPostureEntries, hydrated, isConnected, address, update]);

    function toggle(compositionHash: string) {
        setSubscribed((prev) => {
            const next = new Set(prev);
            if (next.has(compositionHash)) next.delete(compositionHash);
            else next.add(compositionHash);
            return next;
        });
    }

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        if (onSave) {
            if (!address) return;
            onSave(
                buildSubscriptions(subscribed),
                [...otherPostureEntries, ...activeBuyerPolicy(policyEntries, subscribed)],
            ).catch(() => {
                // Caller surfaces the error via `externalError`.
            });
            return;
        }
        router.push("/members/agents");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to load your buyer draft.
                </p>
                <Link href="/members/identity">
                    <Button variant="outline">← Back</Button>
                </Link>
            </Card>
        );
    }

    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Subscribe the assemblies you buy through. Every deal
                    co-produces records, and the records from your side of a
                    purchase are yours — subscribing an assembly surfaces its
                    data below, where you choose what you offer
                    for sale, to whom, and from when. This step is optional: a
                    member who only sells simply leaves it empty.
                </p>
                <p>
                    Prices never live here. Data products are priced as items in
                    your own catalogue, like anything else you sell.
                </p>
            </Card>

            <div className="space-y-3">
                {choices.map((choice) => {
                    const isSubscribed = subscribed.has(choice.compositionHash);
                    return (
                        <Card
                            key={choice.slug}
                            className={`p-4 transition-colors ${isSubscribed ? "border-ink-heading" : ""}`}
                            data-testid={`buyer-assembly-row-${choice.slug}`}
                        >
                            <div className="flex items-start gap-3">
                                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isSubscribed}
                                        onChange={() => toggle(choice.compositionHash)}
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
                                        <AssemblyShapeLine
                                            choice={choice}
                                            className="text-[11px]"
                                            testId={`buyer-assembly-shape-${choice.slug}`}
                                        />
                                        <p className="text-xs text-ink-faint">
                                            Networks: {choice.networkTargets.join(", ")}
                                        </p>
                                    </div>
                                </label>
                                <Link
                                    href={`/assemblies/designer/view?slug=${encodeURIComponent(choice.slug)}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center shrink-0"
                                    data-testid={`buyer-assembly-inspect-${choice.slug}`}
                                >
                                    Inspect ↗
                                </Link>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* BUYER-side data-disclosure — classes derive from the
                subscriptions selected above; nothing here is required. */}
            <DisclosurePolicyEditor
                choices={choices.filter((c) => subscribed.has(c.compositionHash))}
                entries={policyEntries}
                onChange={setPolicyEntries}
                postures={["buyer"]}
            />

            {subscribed.size > 0 && (
                <Card className="p-6 text-sm text-ink-body space-y-2">
                    <p>
                        Price what you offered: list that data as items in{" "}
                        <Link href="/members/catalogue" className="text-ink-heading font-medium hover:underline">
                            your catalogue
                        </Link>
                        {" "}— fixed or rate, in the tokens you accept. The item&apos;s
                        license terms (scope, access, redistribution, source
                        processes) are authored on the item and ride into the
                        agreement both parties sign.
                    </p>
                    <p>
                        To make those items orderable, bind a data-sale assembly on
                        the assemblies step — one whose composition carries the
                        data-license and content-handoff terms, like the anchored
                        data-stream subscription reference.
                    </p>
                </Card>
            )}

            {externalError && (
                <p className="text-sm text-red-600" role="alert">{externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/members/assemblies"}
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
