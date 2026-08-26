"use client";

/**
 * MemberEditCatalogue — re-uses the wizard's catalogue form to
 * edit a registered seller's pinned catalogue. Routes from the
 * `/members` manage-list "Catalogue" row.
 *
 * Two-pin save sequence:
 *   1. Pin the new catalogue JSON via `publishMemberCatalogue`,
 *      yielding a fresh `ipfs://<catalogueCID>` URI.
 *   2. Re-pin the profile JSON with the updated `catalogueURI`
 *      field via `useUpdateMemberProfile.save({ catalogueURI })`,
 *      then dispatch `MembersRegistry.updateProfile(newProfileURI)`.
 *
 * Per-item delete is handled inside the form (each item row has a
 * Remove control). Whole-catalogue clearing isn't currently a
 * separate affordance — saving with zero items is blocked by the
 * form's existing validation ("Add at least one item with a name
 * and a price.") since a registered seller with an empty
 * catalogue is a degenerate state.
 *
 * On top of the shared editor scaffold, this surface fetches a
 * SECOND document (the catalogue JSON behind `profile.catalogueURI`)
 * before the form can render: the profile carries `acceptedTokens` +
 * `defaultTokenAddress` (for the per-item pricing label), the
 * catalogue carries the items themselves.
 */

import { useEffect, useState } from "react";
import { MemberEditGate } from "@/components/members/MemberEditGate";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import { fetchMemberCatalogue } from "@/lib/member/catalogueFetcher";
import { extractErrorMessage, toError } from "@/lib/shared/errors";
import type {
    MemberCatalogueMetadata,
    UnitSystem,
    CatalogueItemMetadata,
} from "@/lib/member/memberCatalogueMetadata";
import { publishMemberCatalogue } from "@/lib/member/cataloguePublisher";
import { OnboardingCatalogueForm } from "@/components/members/OnboardingCatalogueForm";

export function MemberEditCatalogue() {
    const [existingCatalogue, setExistingCatalogue] = useState<MemberCatalogueMetadata | null>(null);
    const [pinningCatalogue, setPinningCatalogue] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const editor = useMemberProfileEditor({
        sourceNoun: "profile or catalogue",
        clobberNoun: "items",
        extraSaveInFlight: pinningCatalogue,
        extraFetch: { pending: !existingCatalogue, message: "Fetching catalogue from IPFS…" },
        // Seed both halves so the catalogue form renders pre-populated.
        // The form reads `state.profile.defaultTokenAddress` +
        // `state.profile.acceptedTokens` for the price-token symbol, and
        // `state.catalogue.items` for the item list. `extraFetch` holds
        // seeding until `existingCatalogue` is fetched.
        seed: (existingProfile, update) => {
            if (!existingCatalogue) return;
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
                catalogue: { items: existingCatalogue.items, unitSystem: existingCatalogue.unitSystem },
                // Feed the data-for-sale select's options — the member's
                // declared data offers; read-only here (the policy is
                // edited on the assemblies / buyer surfaces).
                disclosurePolicy: existingProfile.disclosurePolicy ?? [],
            });
        },
    });
    const { existingProfile, setFetchError, address } = editor;

    // Fetch the catalogue JSON the profile references via
    // `catalogueURI`, once the shared scaffold has the profile.
    useEffect(() => {
        if (!existingProfile) return;
        let cancelled = false;
        (async () => {
            try {
                if (!existingProfile.catalogueURI) {
                    // Edge: a profile without a catalogue. Treat as
                    // an empty starting point for editing.
                    setExistingCatalogue({
                        subjectAddress: existingProfile.subjectAddress ?? (address as `0x${string}`),
                        items: [],
                        version: "1.0.0",
                    });
                    return;
                }

                // The ONE cached catalogue read path (lib/member/catalogueFetcher).
                const catalogue = await fetchMemberCatalogue(existingProfile.catalogueURI);
                if (cancelled) return;
                try {
                    if (!catalogue) throw new Error("Couldn't fetch or parse the catalogue document.");
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
    }, [existingProfile, address, setFetchError]);

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
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
            const newCatalogue: MemberCatalogueMetadata = {
                subjectAddress,
                items: items,
                version: existingCatalogue?.version ?? "1.0.0",
                unitSystem,
            };
            const result = await publishMemberCatalogue(newCatalogue);
            newCatalogueURI = result.uri;
        } catch (err) {
            const e = toError(err);
            setSaveError(`Couldn't pin catalogue: ${e.message}`);
            setPinningCatalogue(false);
            throw e;
        }
        setPinningCatalogue(false);

        // Step 2: re-pin the profile with the new catalogueURI and
        // dispatch updateProfile. The hook handles its own errors;
        // any failure flows through `updater.error`.
        await editor.updater.save({ catalogueURI: newCatalogueURI });
    }

    return (
        <div className="space-y-12">
            <OnboardingCatalogueForm
                onSave={handleSave}
                submitLabel="Save changes"
                backHref="/members/manage"
                backLabel="← Cancel"
                submitInFlight={editor.saveInFlight}
                externalError={saveError ?? editor.externalError}
            />
            <DeleteCatalogueFooter
                disabled={editor.saveInFlight}
                onDelete={async () => {
                    setSaveError(null);
                    await editor.updater.save({}, { clear: ["catalogueURI"] });
                }}
                error={editor.updater.error?.message ?? null}
            />
        </div>
    );
}

/**
 * Bottom-of-page destructive footer. Mirrors the Withdraw row
 * pattern on /members/manage: muted link expands inline to a
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
                    className="text-sm border border-default rounded px-3 py-1.5 text-error-fg hover:bg-paper-200 transition-colors disabled:opacity-50"
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
                <p className="text-xs text-error-fg" role="alert">{error}</p>
            )}
        </div>
    );
}
