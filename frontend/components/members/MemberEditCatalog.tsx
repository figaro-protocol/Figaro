"use client";

/**
 * MemberEditCatalog — re-uses the wizard's catalog form to
 * edit a registered member's pinned catalog. Routes from the
 * `/members` manage-list "Catalog" row.
 *
 * Two-pin save sequence:
 *   1. Pin the new catalog JSON via `publishMemberCatalog`,
 *      yielding a fresh `ipfs://<catalogCID>` URI.
 *   2. Re-pin the profile JSON with the updated `catalogURI`
 *      field via `useUpdateMemberProfile.save({ catalogURI })`,
 *      then dispatch `MembersRegistry.updateProfile(newProfileURI)`.
 *
 * Per-item delete is handled inside the form (each item row has a
 * Remove control). A member need not sell anything: saving with zero
 * items clears `catalogURI` from the profile, as the delete footer does,
 * rather than pinning an empty catalog.
 *
 * On top of the shared editor scaffold, this surface fetches a
 * SECOND document (the catalog JSON behind `profile.catalogURI`)
 * before the form can render: the profile carries `acceptedTokens` +
 * `defaultTokenAddress` (for the per-item pricing label), the
 * catalog carries the items themselves.
 */

import { useEffect, useState } from "react";
import { MemberEditGate } from "@/components/members/MemberEditGate";
import { Button } from "@/components/ui/Button";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import { fetchMemberCatalog } from "@/lib/member/catalogFetcher";
import { toError } from "@/lib/shared/errors";
import type {
    MemberCatalogMetadata,
    UnitSystem,
    CatalogItemMetadata,
} from "@/lib/member/memberCatalogMetadata";
import { publishMemberCatalog } from "@/lib/member/catalogPublisher";
import { OnboardingCatalogForm } from "@/components/members/OnboardingCatalogForm";

export function MemberEditCatalog() {
    const [existingCatalog, setExistingCatalog] = useState<MemberCatalogMetadata | null>(null);
    const [pinningCatalog, setPinningCatalog] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const editor = useMemberProfileEditor({
        extraSaveInFlight: pinningCatalog,
        extraFetch: { pending: !existingCatalog, message: "Fetching catalog from IPFS…" },
        // Seed both halves so the catalog form renders pre-populated.
        // The form reads `state.profile.defaultTokenAddress` +
        // `state.profile.acceptedTokens` for the price-token symbol, and
        // `state.catalog.items` for the item list. `extraFetch` holds
        // seeding until `existingCatalog` is fetched.
        seed: (existingProfile, update) => {
            if (!existingCatalog) return;
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
                catalog: { items: existingCatalog.items, unitSystem: existingCatalog.unitSystem },
                // The member's bindings — read-only here (they are edited on
                // the assemblies surface), and the form needs them: the item
                // properties it asks for are the catalog-filled fields of
                // the clauses those bound assemblies compose.
                assemblies: existingProfile.assemblyBindings ?? [],
                // Feed the data-for-sale select's options — the member's
                // declared data offers; read-only here (the policy is
                // edited on the assemblies / buyer surfaces).
            });
        },
    });
    const { existingProfile, markReadAbsent, address } = editor;

    // Fetch the catalog JSON the profile references via
    // `catalogURI`, once the shared scaffold has the profile.
    useEffect(() => {
        if (!existingProfile) return;
        let canceled = false;
        (async () => {
            try {
                if (!existingProfile.catalogURI) {
                    // Edge: a profile without a catalog. Treat as
                    // an empty starting point for editing.
                    setExistingCatalog({
                        subjectAddress: existingProfile.subjectAddress ?? (address as `0x${string}`),
                        items: [],
                        version: "1.0.0",
                    });
                    return;
                }

                // The ONE cached catalog read path (lib/member/catalogFetcher).
                const catalog = await fetchMemberCatalog(existingProfile.catalogURI);
                if (canceled) return;
                // A catalog that could not be read is absent: no error text,
                // and no form (a blind save would clobber its items).
                if (catalog) setExistingCatalog(catalog);
                else markReadAbsent();
            } catch {
                if (!canceled) markReadAbsent();
            }
        })();
        return () => {
            canceled = true;
        };
    }, [existingProfile, address, markReadAbsent]);

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
    }

    async function handleSave(items: CatalogItemMetadata[], unitSystem: UnitSystem): Promise<void> {
        setSaveError(null);
        if (!address) {
            const e = new Error("Wallet disconnected mid-save.");
            setSaveError(e.message);
            throw e;
        }

        // No item: the member sells nothing, so the profile links no
        // catalog — the same act as the delete footer below.
        if (items.length === 0) {
            await editor.updater.save({}, { clear: ["catalogURI"] });
            return;
        }

        // Step 1: pin the new catalog JSON.
        setPinningCatalog(true);
        let newCatalogURI: string;
        try {
            const subjectAddress = (existingProfile?.subjectAddress ?? address) as `0x${string}`;
            const newCatalog: MemberCatalogMetadata = {
                subjectAddress,
                items: items,
                version: existingCatalog?.version ?? "1.0.0",
                unitSystem,
            };
            const result = await publishMemberCatalog(newCatalog);
            newCatalogURI = result.uri;
        } catch (err) {
            const e = toError(err);
            setSaveError(`Couldn't pin catalog: ${e.message}`);
            setPinningCatalog(false);
            throw e;
        }
        setPinningCatalog(false);

        // Step 2: re-pin the profile with the new catalogURI and
        // dispatch updateProfile. The hook handles its own errors;
        // any failure flows through `updater.error`.
        await editor.updater.save({ catalogURI: newCatalogURI });
    }

    return (
        <div className="space-y-12">
            <OnboardingCatalogForm
                onSave={handleSave}
                submitLabel="Save changes"
                backHref="/members/manage"
                backLabel="← Cancel"
                submitInFlight={editor.saveInFlight}
                externalError={saveError ?? editor.externalError}
            />
            <DeleteCatalogFooter
                disabled={editor.saveInFlight}
                onDelete={async () => {
                    setSaveError(null);
                    await editor.updater.save({}, { clear: ["catalogURI"] });
                }}
                error={editor.updater.error?.message ?? null}
            />
        </div>
    );
}

/**
 * Bottom-of-page destructive footer. Mirrors the Withdraw row
 * pattern on /members/manage: muted link expands inline to a
 * confirm/cancel pair on click. Action clears `catalogURI` from
 * the profile (one-pin sequence — the existing catalog document
 * stays pinned on IPFS but is no longer referenced from the
 * member's on-chain metadata).
 */
function DeleteCatalogFooter({
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
            <div className="pt-4 border-t border-default text-xs text-ink-muted">
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setConfirming(true)}
                    disabled={disabled}
                    className="px-0 text-inherit underline hover:text-ink-heading"
                >
                    Delete catalog entirely
                </Button>
            </div>
        );
    }

    return (
        <div className="pt-4 border-t border-default space-y-2 text-sm text-ink-body">
            <p className="text-xs">
                Clears <code>catalogURI</code> from the on-chain profile. The catalog document remains pinned on IPFS (content-addressed pins are immutable) but the buyer-side discovery surface no longer surfaces it. Re-add items by editing the catalog again. Deposit and lock period are unaffected.
            </p>
            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={running || disabled}
                    className="text-sm border-default rounded py-1.5 text-error-fg"
                >
                    {running ? "Deleting…" : "Confirm delete"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={running}
                    className="px-0 text-xs text-ink-muted hover:bg-transparent hover:text-ink-heading"
                >
                    Cancel
                </Button>
            </div>
            {error && (
                <p className="text-xs text-error-fg" role="alert">{error}</p>
            )}
        </div>
    );
}
