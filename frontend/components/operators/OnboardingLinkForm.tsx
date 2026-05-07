"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { publishMerchantCatalogue } from "@/lib/shared/cataloguePublisher";
import { truncateHex } from "@/lib/shared/formatHex";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";

/**
 * Step 4 of the onboarding wizard. Pins the catalogue document
 * (`SellerCatalogueMetadata { subjectAddress, items, version }`) to
 * IPFS and saves the resulting URI on the onboarding state under
 * `publishedCatalogueURI`. The profile document is pinned later, in
 * step 7, so that assemblies (step 5) and agent endpoints (step 6)
 * can be embedded in a single profile pin + a single on-chain
 * transaction.
 *
 * Idempotent: if `publishedCatalogueURI` is already set, the page
 * shows the existing URI and lets the user re-publish if they've
 * changed items since.
 */
export function OnboardingLinkForm() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { state, update } = useOnboardingState(address);

    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const items = state.catalogue?.items ?? [];
    const itemCount = items.length;
    const publishedURI = state.publishedCatalogueURI;

    async function handlePublish() {
        if (!address) {
            setError("Connect a wallet first.");
            return;
        }
        if (itemCount === 0) {
            setError("Your catalogue has no items. Go back to step 3 and add at least one.");
            return;
        }

        setPublishing(true);
        setError(null);

        try {
            const catalogue: SellerCatalogueMetadata = {
                subjectAddress: address,
                menu: items,
                version: "1.0.0",
            };
            const { uri } = await publishMerchantCatalogue(catalogue);
            update({ publishedCatalogueURI: uri });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPublishing(false);
        }
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">Connect a wallet to publish your catalogue.</p>
                <Link href="/operators/onboard/profile">
                    <Button variant="outline">← Back</Button>
                </Link>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">Catalogue</h2>
                <p className="text-sm text-ink-body">
                    {itemCount === 0 ? (
                        <>You have no items yet. Go back to step 3 to add some before publishing.</>
                    ) : (
                        <>
                            <span className="font-semibold text-ink-heading">{itemCount}</span>
                            {" "}item{itemCount === 1 ? "" : "s"} ready to pin.
                        </>
                    )}
                </p>
                {publishedURI ? (
                    <div className="space-y-2">
                        <p className="text-sm text-ink-body">
                            <span className="font-semibold text-ink-heading">Published.</span> Catalogue CID:
                        </p>
                        <code className="block text-xs text-ink-faint font-mono break-all bg-paper-200 rounded p-2">
                            {publishedURI}
                        </code>
                        <p className="text-xs text-ink-faint">
                            ({truncateHex(publishedURI, { head: 18, tail: 6 })})
                        </p>
                    </div>
                ) : null}
            </Card>

            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">What happens here</h2>
                <p className="text-sm text-ink-body">
                    We pin your catalogue document to IPFS. The resulting URI is
                    stamped onto your draft profile so that the profile, when
                    pinned in step 7, points at the right items.
                </p>
                <p className="text-sm text-ink-body">
                    No on-chain transaction yet. The single <code>register</code>
                    {" "}or <code>updateProfile</code> call happens at the end of
                    the wizard, after you&apos;ve picked assemblies (step 5) and
                    optionally added agent endpoints (step 6).
                </p>
            </Card>

            {error && (
                <p className="text-sm text-red-600" role="alert">
                    {error}
                </p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/operators/onboard/catalogue"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant={publishedURI ? "outline" : "default"}
                        onClick={handlePublish}
                        disabled={publishing || itemCount === 0}
                    >
                        {publishing
                            ? "Pinning…"
                            : publishedURI
                                ? "Re-publish"
                                : "Publish catalogue"}
                    </Button>
                    {publishedURI && (
                        <Link href="/operators/onboard/assemblies">
                            <Button>Next →</Button>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
