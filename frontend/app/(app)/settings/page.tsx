import type { Metadata } from "next";
import Link from "next/link";
import { SettingsForm } from "./_components/SettingsForm";

/**
 * /settings — the wallet's own runtime-infrastructure endpoints.
 *
 * Server component (matches the `/orders`, `/discover`, `/audit` shape): it
 * exports `metadata` and renders the subject heading + copy so the
 * static-export shell states what this page is BEFORE hydration. A stranger
 * who lands here via curl (or before the wallet-aware form mounts) sees
 * "Endpoints" and a description of endpoint overrides + coordination
 * transport — not the site-default title. The interactive, mount-gated form
 * lives in the `"use client"` child `<SettingsForm />`.
 *
 * The nav labels this route "Endpoints" (`components/shared/navLinks.ts`);
 * the visible page title here is also "Endpoints", so the label matches what
 * you land on. The route slug stays `/settings`.
 */
export const metadata: Metadata = {
    title: "Your endpoints — Figaro Protocol",
    description:
        "Point this frontend at your own RPC and IPFS endpoints, and choose how a pending commitment reaches the other party — share-links-only or XMTP. Overrides live in this browser and never leave your device.",
};

export default function SettingsPage() {
    return (
        <div className="container mx-auto px-6 pt-16 pb-24 max-w-2xl space-y-6">
            <header className="space-y-2">
                <h1 className="text-heading-h1 text-ink-heading">Your endpoints</h1>
                <p className="text-sm text-ink-body">
                    The network services this frontend reads and writes through are
                    yours, not an operator&apos;s: chain reads go through your own RPC
                    provider, and what you publish is pinned on your own IPFS
                    node — you pay for it, and you can erase it. Leave a field
                    empty to use this deployment&apos;s default. The same ownership
                    extends to your trade records — see{" "}
                    <Link href="/data" className="text-ink-heading font-medium hover:underline">
                        your records, your terms
                    </Link>
                    .
                </p>
            </header>

            <SettingsForm />
        </div>
    );
}
