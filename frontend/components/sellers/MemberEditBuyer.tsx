"use client";

/**
 * MemberEditBuyer — re-uses the wizard's buyer form to edit the
 * registered member's `buyerAssemblies` subscriptions and their
 * buyer-posture disclosure entries. Routes from the `/members`
 * manage-list "Buyer" row.
 *
 * One-pin save sequence: re-pin the profile JSON with the updated
 * fields, dispatch MembersRegistry.updateProfile. Seller-posture
 * disclosure entries ride through untouched — the form passes the
 * FULL policy list.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { useUpdateMemberProfile } from "@/lib/member/useUpdateMemberProfile";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type {
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
    MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { OnboardingBuyerForm } from "@/components/sellers/OnboardingBuyerForm";

export function MemberEditBuyer() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading } = useMemberProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<MemberProfileMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    const updater = useUpdateMemberProfile(existingProfile, registryData?.[0] ?? null);
    const saveInFlight = updater.isPending || updater.isConfirming;

    // Redirect unregistered wallets to onboarding — only on SETTLED
    // state, and never mid-save (same discipline as SellerEditAssemblies).
    useEffect(() => {
        if (!mounted || saveInFlight) return;
        if (!isConnected) {
            router.replace("/members");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/members");
        }
    }, [mounted, saveInFlight, isConnected, registryLoading, registryData, router]);

    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        let cancelled = false;
        fetchMemberProfile(metadataURI)
            .then((parsed) => {
                if (cancelled) return;
                if (parsed) setExistingProfile(parsed);
                else setFetchError("Couldn't fetch or parse the member profile.");
            })
            .catch(() => {
                if (!cancelled) setFetchError("Couldn't fetch profile from IPFS.");
            });
        return () => {
            cancelled = true;
        };
    }, [registryData]);

    useEffect(() => {
        if (seeded) return;
        if (!loaded) return;
        if (!existingProfile) return;
        update({
            buyerAssemblies: existingProfile.buyerAssemblies ?? [],
            disclosurePolicy: existingProfile.disclosurePolicy ?? [],
        });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, update]);

    useEffect(() => {
        if (updater.isSuccess) {
            router.push("/members");
        }
    }, [updater.isSuccess, router]);

    if (!mounted) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }
    if (!isConnected) {
        return <Card className="p-8 text-sm text-ink-faint">Redirecting…</Card>;
    }
    if (registryLoading || !registryData) {
        return <Card className="p-8 text-sm text-ink-faint">Reading registry…</Card>;
    }

    if (fetchError) {
        return (
            <Card className="p-8 space-y-3">
                <p className="text-sm text-red-600" role="alert">{fetchError}</p>
                <p className="text-xs text-ink-faint">
                    Couldn&apos;t load the existing profile, so editing the buyer side isn&apos;t safe — saving without the existing fields would clobber them.
                </p>
            </Card>
        );
    }

    if (!existingProfile) {
        return <Card className="p-8 text-sm text-ink-faint">Fetching profile from IPFS…</Card>;
    }
    if (!seeded) {
        return <Card className="p-8 text-sm text-ink-faint">Setting up editor…</Card>;
    }

    async function handleSave(
        subscriptions: BuyerAssemblySubscription[],
        disclosurePolicy: DisclosurePolicyEntry[],
    ): Promise<void> {
        // Absence is each field's no-declaration state — an emptied list
        // CLEARS the field instead of pinning `[]`, so a member who never
        // declared round-trips unchanged.
        const patch: Partial<MemberProfileMetadata> = {};
        const clear: ("buyerAssemblies" | "disclosurePolicy")[] = [];
        if (subscriptions.length > 0) patch.buyerAssemblies = subscriptions;
        else clear.push("buyerAssemblies");
        if (disclosurePolicy.length > 0) patch.disclosurePolicy = disclosurePolicy;
        else clear.push("disclosurePolicy");
        await updater.save(patch, clear.length > 0 ? { clear } : undefined);
    }

    return (
        <OnboardingBuyerForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members"
            backLabel="← Cancel"
            submitInFlight={updater.isPending || updater.isConfirming}
            externalError={
                updater.error
                    ? (updater.error.message ?? String(updater.error))
                    : null
            }
        />
    );
}
