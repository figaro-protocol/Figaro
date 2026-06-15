"use client";

/**
 * SellerEditCatalogue — re-uses the wizard's catalogue form to
 * edit a registered seller's pinned catalogue. Routes from the
 * `/sellers` manage-list "Catalogue" row.
 *
 * Two-pin save sequence:
 *   1. Pin the new catalogue JSON via `publishSellerCatalogue`,
 *      yielding a fresh `ipfs://<catalogueCID>` URI.
 *   2. Re-pin the profile JSON with the updated `catalogueURI`
 *      field via `useUpdateSellerProfile.save({ catalogueURI })`,
 *      then dispatch `SellerRegistry.updateProfile(newProfileURI)`.
 *
 * Per-item delete is handled inside the form (each item row has a
 * Remove control). Whole-catalogue clearing isn't currently a
 * separate affordance — saving with zero items is blocked by the
 * form's existing validation ("Add at least one item with a name
 * and a price.") since a registered seller with an empty
 * catalogue is a degenerate state.
 *
 * Wallet-not-connected and wallet-not-registered both redirect to
 * `/sellers`, matching the redirect-on-miss pattern at
 * `/sellers` and `/sellers/edit/identity`.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useSellerProfile } from "@/lib/seller/useSellerRegistry";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { useUpdateSellerProfile } from "@/lib/seller/useUpdateSellerProfile";
import { extractErrorMessage } from "@/lib/shared/errors";
import { resolveContentUri } from "@/lib/shared/ipfsService";
import { tryParseSellerProfileDocument } from "@/lib/seller/sellerProfileMetadata";
import type {
    SellerCatalogueMetadata,
    UnitSystem,
    CatalogueItemMetadata,
} from "@/lib/seller/sellerCatalogueMetadata";
import { parseSellerCatalogueDocument } from "@/lib/seller/sellerCatalogueMetadataParser";
import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
import { publishSellerCatalogue } from "@/lib/seller/cataloguePublisher";
import { OnboardingCatalogueForm } from "@/components/sellers/OnboardingCatalogueForm";

export function SellerEditCatalogue() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading } = useSellerProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<SellerProfileMetadata | null>(null);
    const [existingCatalogue, setExistingCatalogue] = useState<SellerCatalogueMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);
    const [pinningCatalogue, setPinningCatalogue] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Redirect unregistered wallets to onboarding.
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

    // Fetch the on-chain profile JSON, then the catalogue JSON it
    // references via `catalogueURI`. Both are needed before we can
    // render the form: the profile carries `acceptedTokens` +
    // `defaultTokenAddress` (for the per-item pricing label), the
    // catalogue carries the items themselves.
    useEffect(() => {
        if (!registryData) return;
        const [profileURI] = registryData;
        const url = resolveContentUri(profileURI);
        if (!url) {
            setFetchError("Profile URI couldn't be resolved.");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const profileDoc = await fetch(url).then((r) => r.json());
                if (cancelled) return;
                const profile = tryParseSellerProfileDocument(profileDoc);
                if (!profile) {
                    setFetchError("Profile JSON didn't parse as an seller profile.");
                    return;
                }
                setExistingProfile(profile);

                if (!profile.catalogueURI) {
                    // Edge: a profile without a catalogue. Treat as
                    // an empty starting point for editing.
                    setExistingCatalogue({
                        subjectAddress: profile.subjectAddress ?? (address as `0x${string}`),
                        menu: [],
                        version: "1.0.0",
                    });
                    return;
                }

                const catUrl = resolveContentUri(profile.catalogueURI);
                if (!catUrl) {
                    setFetchError("Catalogue URI couldn't be resolved.");
                    return;
                }
                const catDoc = await fetch(catUrl).then((r) => r.json());
                if (cancelled) return;
                try {
                    const catalogue = parseSellerCatalogueDocument(catDoc, "edit-catalogue");
                    setExistingCatalogue(catalogue);
                } catch (err) {
                    const detail = extractErrorMessage(err, "");
                    setFetchError(
                        detail
                            ? `Catalogue JSON didn't parse: ${detail}`
                            : "Catalogue JSON didn't parse.",
                    );
                }
            } catch {
                if (!cancelled) setFetchError("Couldn't fetch profile or catalogue from IPFS.");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [registryData, address]);

    // Seed the wizard's localStorage state with both halves so the
    // catalogue form renders pre-populated. The form reads
    // `state.profile.defaultTokenAddress` + `state.profile.acceptedTokens`
    // for the price-token symbol, and `state.catalogue.items` for the
    // item list.
    useEffect(() => {
        if (seeded) return;
        if (!loaded) return;
        if (!existingProfile || !existingCatalogue) return;
        update({
            profile: {
                name: existingProfile.name,
                description: existingProfile.description,
                specialty: existingProfile.specialty,
                location: existingProfile.location,
                branding: existingProfile.branding,
                assets: existingProfile.assets,
                acceptedTokens: existingProfile.acceptedTokens,
                defaultTokenAddress: existingProfile.defaultTokenAddress,
            },
            catalogue: { items: existingCatalogue.menu, unitSystem: existingCatalogue.unitSystem },
        });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, existingCatalogue, update]);

    const updater = useUpdateSellerProfile(existingProfile);

    // Redirect back to /sellers on a confirmed update.
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
                    Couldn&apos;t load the existing profile or catalogue, so editing it isn&apos;t safe — saving without the existing items would clobber them.
                </p>
            </Card>
        );
    }

    if (!existingProfile) {
        return <Card className="p-8 text-sm text-ink-faint">Fetching profile from IPFS…</Card>;
    }
    if (!existingCatalogue) {
        return <Card className="p-8 text-sm text-ink-faint">Fetching catalogue from IPFS…</Card>;
    }
    if (!seeded) {
        return <Card className="p-8 text-sm text-ink-faint">Setting up editor…</Card>;
    }

    async function handleSave(items: CatalogueItemMetadata[], unitSystem: UnitSystem): Promise<void> {
        setSaveError(null);
        if (!address) {
            const e = new Error("Wallet disconnected mid-save.");
            setSaveError(e.message);
            throw e;
        }

        // Step 1: pin the new catalogue JSON.
        setPinningCatalogue(true);
        let newCatalogueURI: string;
        try {
            const subjectAddress = (existingProfile?.subjectAddress ?? address) as `0x${string}`;
            const newCatalogue: SellerCatalogueMetadata = {
                subjectAddress,
                menu: items,
                version: existingCatalogue?.version ?? "1.0.0",
                unitSystem,
            };
            const result = await publishSellerCatalogue(newCatalogue);
            newCatalogueURI = result.uri;
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            setSaveError(`Couldn't pin catalogue: ${e.message}`);
            setPinningCatalogue(false);
            throw e;
        }
        setPinningCatalogue(false);

        // Step 2: re-pin the profile with the new catalogueURI and
        // dispatch updateProfile. The hook handles its own errors;
        // any failure flows through `updater.error`.
        await updater.save({ catalogueURI: newCatalogueURI });
    }

    const isSaving = pinningCatalogue || updater.isPending || updater.isConfirming;
    const externalError =
        saveError ??
        (updater.error ? (updater.error.message ?? String(updater.error)) : null);

    return (
        <div className="space-y-12">
            <OnboardingCatalogueForm
                onSave={handleSave}
                submitLabel="Save changes"
                backHref="/sellers"
                backLabel="← Cancel"
                submitInFlight={isSaving}
                externalError={externalError}
            />
            <DeleteCatalogueFooter
                disabled={isSaving}
                onDelete={async () => {
                    setSaveError(null);
                    await updater.save({}, { clear: ["catalogueURI"] });
                }}
                error={updater.error?.message ?? null}
            />
        </div>
    );
}

/**
 * Bottom-of-page destructive footer. Mirrors the Withdraw row
 * pattern on /sellers: muted link expands inline to a
 * confirm/cancel pair on click. Action clears `catalogueURI` from
 * the profile (one-pin sequence — the existing catalogue document
 * stays pinned on IPFS but is no longer referenced from the
 * seller's on-chain metadata).
 */
function DeleteCatalogueFooter({
    disabled,
    onDelete,
    error,
}: {
    disabled: boolean;
    onDelete: () => Promise<void>;
    error: string | null;
}) {
    const [confirming, setConfirming] = useState(false);
    const [running, setRunning] = useState(false);

    async function handleDelete() {
        setRunning(true);
        try {
            await onDelete();
        } finally {
            setRunning(false);
        }
    }

    if (!confirming) {
        return (
            <div className="pt-4 border-t border-default text-xs text-ink-faint">
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={disabled}
                    className="underline hover:text-ink-heading transition-colors disabled:opacity-50"
                >
                    Delete catalogue entirely
                </button>
            </div>
        );
    }

    return (
        <div className="pt-4 border-t border-default space-y-2 text-sm text-ink-body">
            <p className="text-xs">
                Clears <code>catalogueURI</code> from the on-chain profile. The catalogue document remains pinned on IPFS (content-addressed pins are immutable) but the buyer-side discovery surface no longer surfaces it. Re-add items by editing the catalogue again. Deposit and lock period are unaffected.
            </p>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={running || disabled}
                    className="text-sm border border-default rounded px-3 py-1.5 text-red-600 hover:bg-paper-200 transition-colors disabled:opacity-50"
                >
                    {running ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={running}
                    className="text-xs text-ink-faint hover:text-ink-heading transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
            {error && (
                <p className="text-xs text-red-600" role="alert">{error}</p>
            )}
        </div>
    );
}
