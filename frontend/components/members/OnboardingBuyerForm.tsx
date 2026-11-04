"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/shared/Link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { onboardingNextHref, onboardingPrevHref, useOnboardingState } from "@/lib/member/onboardingState";
import type {
    BuyerAssemblySubscription,
} from "@/lib/member/memberProfileMetadata";
import { type AssemblyChoice, useAssemblyChoices } from "@/lib/protocol/assemblyChoices";
import { AssemblyChoiceRow } from "@/components/members/AssemblyChoiceRow";
import { OnboardingLoadingCard, OnboardingStepFooter, finishStep, type OnboardingStepChromeProps, toggledSet, useSubjectHydration } from "@/components/members/OnboardingStepChrome";

/**
 * The Buy through step of the member wizard — the twin of Sell through. The member SUBSCRIBES the
 * assemblies they buy through — their own list, independent of the
 * seller bindings, because a wallet does not buy through the assemblies
 * it sells through — and toggles which of the data those trades
 * co-produce is offered for sale. Subscribing is the buyer's
 * verb; BINDING stays the seller's.
 *
 * Optional: a member who only sells ships with no subscriptions.
 * Prices never live here — data products are priced as items in the
 * member's own catalog.
 */

function buildSubscriptions(subscribedHashes: Set<string>): BuyerAssemblySubscription[] {
    return [...subscribedHashes].map((h) => ({ assemblyHash: h as `0x${string}` }));
}

export interface OnboardingBuyerFormProps extends OnboardingStepChromeProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(subscriptions)` instead of routing to the next wizard step.
     */
    onSave?: (subscriptions: BuyerAssemblySubscription[]) => Promise<void>;
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
    const { state, loaded, subject, update } = useOnboardingState(address);

    const { read: choicesRead } = useAssemblyChoices();
    const choices: AssemblyChoice[] = useMemo(
        () => (choicesRead.status === "present" ? choicesRead.value : []),
        [choicesRead],
    );

    const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
    const { hydrated, markHydrated } = useSubjectHydration(subject);

    useEffect(() => {
        if (hydrated || !loaded) return;
        setSubscribed(new Set((state.buyerAssemblies ?? []).map((s) => s.assemblyHash)));
        markHydrated();
    }, [hydrated, loaded, markHydrated, state.buyerAssemblies]);

    useEffect(() => {
        if (!hydrated) return;
        update({
            buyerAssemblies: buildSubscriptions(subscribed),
        });
    }, [subscribed, hydrated, update]);

    function toggle(assemblyHash: string) {
        setSubscribed((prev) => toggledSet(prev, assemblyHash));
    }

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        finishStep(
            onSave && (() => onSave(buildSubscriptions(subscribed))),
            () => router.push(onboardingNextHref("buyer")),
        );
    }

    if (!mounted) {
        return <OnboardingLoadingCard />;
    }


    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    Subscribe the assemblies you buy through. Every trade
                    co-produces data, and the data from your side of a
                    purchase are yours — subscribing an assembly surfaces its
                    data below, where you choose what you offer
                    for sale, to whom, and from when. This step is optional: a
                    member who only sells simply leaves it empty.
                </p>
                <p>
                    Prices never live here. Data products are priced as items in
                    your own catalog, like anything else you sell.
                </p>
            </Card>

            <div className="space-y-3">
                {choices.map((choice) => {
                    const isSubscribed = subscribed.has(choice.assemblyHash);
                    return (
                        <AssemblyChoiceRow
                            key={choice.slug}
                            choice={choice}
                            checked={isSubscribed}
                            onToggle={() => toggle(choice.assemblyHash)}
                            testIdPrefix="buyer-assembly"
                        />
                    );
                })}
            </div>

            {subscribed.size > 0 && (
                <Card className="p-6 text-sm text-ink-body space-y-2">
                    <p>
                        Sell the data your trades produce by listing it as items in{" "}
                        <Link href="/members/catalog" className="text-ink-heading font-medium hover:underline">
                            your catalog
                        </Link>
                        {" "}— fixed or rate, in the tokens you accept. The item&apos;s
                        license terms (scope, access, redistribution, source
                        processes) are filled on the item and ride into the
                        agreement both parties sign.
                    </p>
                    <p>
                        To make those items orderable, bind a data-sale assembly on
                        the{" "}
                        <Link href="/members/assemblies" className="text-ink-heading font-medium hover:underline">
                            Sell through
                        </Link>
                        {" "}step — one whose composition carries the
                        data-license and content-handoff terms, like the anchored
                        data-stream subscription reference.
                    </p>
                </Card>
            )}

            {externalError && (
                <p className="text-sm text-error-fg" role="alert">{externalError}</p>
            )}

            <OnboardingStepFooter
                backHref={backHref}
                backLabel={backLabel}
                submitLabel={submitLabel}
                submitInFlight={submitInFlight}
                defaultBackHref={onboardingPrevHref("buyer")}
            />
        </form>
    );
}
