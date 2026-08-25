"use client";

/**
 * MemberEditAgents — re-uses the wizard's agents form to edit
 * the registered seller's ERC-8004 service endpoints. Routes
 * from the `/members` manage-list "Agents" row.
 *
 * One-pin save sequence: re-pin profile JSON with updated
 * `services` field, dispatch MembersRegistry.updateProfile.
 *
 * Per-endpoint clearing is handled in the form (blank a field to
 * remove that endpoint). Whole-services clearing is implicit when
 * every field is blank — the submit payload becomes `undefined`
 * and the merge (with `clear: ["services"]`) strips the field
 * entirely from the on-chain profile.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro doesn't depend on
 * ERC-8004; these endpoints are an OPTIONAL cross-protocol
 * discoverability convention. They declare REACHABILITY, not what
 * runs the wallet — saving with no endpoints is a normal state, and
 * leaves the wallet simply unreachable for inbound coordination.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { useOnboardingState } from "@/lib/member/onboardingState";
import { useUpdateMemberProfile } from "@/lib/member/useUpdateMemberProfile";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type {
    MemberAgentServices,
    MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

export function MemberEditAgents() {
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

    // Redirect unregistered wallets to onboarding — but only on SETTLED
    // state (`!registryLoading && !registryData` = a completed scan found
    // nothing; isLoading starts true in useMemberProfile), and never
    // mid-save: the redirect unmounts the form and kills the in-flight
    // pin/tx (2026-07-09 e2e flake).
    useEffect(() => {
        if (!mounted || saveInFlight) return;
        if (!isConnected) {
            router.replace("/members/manage");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/members/manage");
        }
    }, [mounted, saveInFlight, isConnected, registryLoading, registryData, router]);

    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        let cancelled = false;
        // The ONE cached profile read path (lib/member/profileFetcher).
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
        update({ services: existingProfile.services });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, update]);

    useEffect(() => {
        if (updater.isSuccess) {
            router.push("/members/manage");
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
                <p className="text-sm text-error-fg" role="alert">{fetchError}</p>
                <p className="text-xs text-ink-faint">
                    Couldn&apos;t load the existing profile, so editing the agent endpoints isn&apos;t safe — saving without the existing fields would clobber them.
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

    async function handleSave(services: MemberAgentServices | undefined): Promise<void> {
        if (services === undefined) {
            // Caller blanked every field — clear the field entirely
            // from the on-chain profile rather than leaving an empty
            // object behind.
            await updater.save({}, { clear: ["services"] });
        } else {
            await updater.save({ services });
        }
    }

    return (
        <OnboardingAgentsForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members/manage"
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
