"use client";

/**
 * OperatorEditAgents — re-uses the wizard's agents form to edit
 * the registered operator's ERC-8004 service endpoints. Routes
 * from the `/operators` manage-list "Agents" row.
 *
 * One-pin save sequence: re-pin profile JSON with updated
 * `services` field, dispatch OperatorRegistry.updateProfile.
 *
 * Per-endpoint clearing is handled in the form (blank a field to
 * remove that endpoint). Whole-services clearing is implicit when
 * every field is blank — the submit payload becomes `undefined`
 * and the merge (with `clear: ["services"]`) strips the field
 * entirely from the on-chain profile.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro doesn't depend on
 * ERC-8004; these endpoints are an OPTIONAL cross-protocol
 * discoverability convention. Saving with no endpoints is a
 * normal state for human-driven operators.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { useUpdateOperatorProfile } from "@/lib/operators/useUpdateOperatorProfile";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type {
    OperatorAgentServices,
    OperatorProfileMetadata,
} from "@/lib/shared/operatorProfileMetadata";
import { OnboardingAgentsForm } from "@/components/operators/OnboardingAgentsForm";

export function OperatorEditAgents() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading, refetch } = useOperatorProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<OperatorProfileMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    useEffect(() => {
        if (!mounted) return;
        if (!isConnected) {
            router.replace("/operators/onboard");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/operators/onboard");
        }
    }, [mounted, isConnected, registryLoading, registryData, router]);

    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        const url = resolveContentURI(metadataURI);
        if (!url) {
            setFetchError("Profile URI couldn't be resolved.");
            return;
        }
        let cancelled = false;
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseOperatorProfileDocument(doc);
                if (parsed) setExistingProfile(parsed);
                else setFetchError("Profile JSON didn't parse as an operator profile.");
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

    const updater = useUpdateOperatorProfile(existingProfile);

    useEffect(() => {
        if (updater.isSuccess) {
            refetch();
            router.push("/operators");
        }
    }, [updater.isSuccess, refetch, router]);

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

    async function handleSave(services: OperatorAgentServices | undefined): Promise<void> {
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
            backHref="/operators"
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
