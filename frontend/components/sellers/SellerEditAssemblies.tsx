"use client";

/**
 * SellerEditAssemblies — re-uses the wizard's assemblies form to
 * edit the registered seller's `assemblyBindings`. Routes from
 * the `/sellers` manage-list "Assemblies" row.
 *
 * One-pin save sequence: re-pin the profile JSON with the updated
 * assemblyBindings array, dispatch SellerRegistry.updateProfile.
 *
 * Removing an assembly (un-checking it in the multi-select) is
 * handled by the form's existing toggle. Whole-assemblies clearing
 * isn't a separate destructive affordance — it's implicit when the
 * user un-checks every assembly. An seller with zero bindings is
 * still on-chain registered; the assemblies just don't surface to
 * assembly-scoped discovery.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useSellerProfile } from "@/lib/seller/useSellerRegistry";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { useUpdateSellerProfile } from "@/lib/seller/useUpdateSellerProfile";
import { resolveContentUri } from "@/lib/shared/ipfsService";
import { tryParseSellerProfileDocument } from "@/lib/seller/sellerProfileMetadata";
import type { AssemblyBindingRecord, SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
import { OnboardingAssembliesForm } from "@/components/sellers/OnboardingAssembliesForm";

export function SellerEditAssemblies() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading } = useSellerProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<SellerProfileMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    useEffect(() => {
        if (!mounted) return;
        if (!isConnected) {
            router.replace("/sellers");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/sellers");
        }
    }, [mounted, isConnected, registryLoading, registryData, router]);

    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        const url = resolveContentUri(metadataURI);
        if (!url) {
            setFetchError("Profile URI couldn't be resolved.");
            return;
        }
        let cancelled = false;
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseSellerProfileDocument(doc);
                if (parsed) setExistingProfile(parsed);
                else setFetchError("Profile JSON didn't parse as an seller profile.");
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
        update({ assemblies: existingProfile.assemblyBindings ?? [] });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, update]);

    const updater = useUpdateSellerProfile(existingProfile);

    useEffect(() => {
        if (updater.isSuccess) {
            router.push("/sellers");
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
                    Couldn&apos;t load the existing profile, so editing the assemblies isn&apos;t safe — saving without the existing fields would clobber them.
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

    async function handleSave(bindings: AssemblyBindingRecord[]): Promise<void> {
        // Saving with an empty array is allowed — un-checking every
        // assembly clears the bindings array on the profile (the
        // seller stays registered, just with no assembly-scoped
        // discovery). The hook's merge keeps the field present-but-
        // empty rather than stripping it.
        await updater.save({ assemblyBindings: bindings });
    }

    return (
        <OnboardingAssembliesForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/sellers"
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
