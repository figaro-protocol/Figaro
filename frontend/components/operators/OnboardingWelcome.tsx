"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Welcome screen body. Explains the seven-step flow in concrete terms,
 * shows what each step asks for, and links forward to step 2 (Profile).
 *
 * Does NOT require a connected wallet — the wallet check happens on the
 * profile screen, where the wallet's address is needed to scope state.
 */
export function OnboardingWelcome() {
    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-4">
                <h2 className="text-heading-h2 text-ink-heading">What happens in each step</h2>
                <dl className="space-y-3 text-sm text-ink-body">
                    <Item n={2} label="Profile">
                        Your stable identity. Name, description, location, branding (logo, CSS, images), accepted tokens, default-pricing token. Pinned to IPFS.
                    </Item>
                    <Item n={3} label="Catalogue">
                        Your list of items. Each item has a name, price (in your default token), category, optional image. Pinned to IPFS separately so item edits don&apos;t re-pin the whole identity envelope.
                    </Item>
                    <Item n={4} label="Link">
                        We embed the catalogue&apos;s IPFS URI in your profile and pin one final document — that&apos;s what <code>OperatorRegistry.metadataURI</code> points to on-chain.
                    </Item>
                    <Item n={5} label="Assemblies">
                        Choose which assemblies you participate in. Per-assembly: trusted counterparty addresses (e.g. couriers you work with), mechanism configuration where the assembly asks for it.
                    </Item>
                    <Item n={6} label="Agent endpoints">
                        Advanced. ERC-8004 service endpoints (mcp / a2a / rest / did / ens) for autonomous-agent operators. Skip if your wallet is human-driven.
                    </Item>
                    <Item n={7} label="Done">
                        We submit <code>register</code> (or <code>updateProfile</code> if you&apos;ve registered before) and route you to your view page.
                    </Item>
                </dl>
            </Card>

            <Card className="p-6 space-y-4">
                <h2 className="text-heading-h2 text-ink-heading">Before you start</h2>
                <ul className="space-y-2 text-sm text-ink-body list-disc pl-5">
                    <li>You need a connected wallet on the active network. Connect it on the next screen.</li>
                    <li>You need a small reclaimable ETH deposit (anti-spam). The exact amount is shown before you sign.</li>
                    <li>
                        Your draft is saved to this browser&apos;s local storage as you go — you can leave the flow and return without losing
                        what you filled in. The draft is keyed by your wallet address; switching wallets switches drafts.
                    </li>
                </ul>
            </Card>

            <div className="flex items-center justify-between">
                <Link
                    href="/operators"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back to operators
                </Link>
                <Link href="/operators/onboard/profile">
                    <Button>Start →</Button>
                </Link>
            </div>
        </div>
    );
}

function Item({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-4">
            <dt className="w-12 flex-shrink-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-default text-xs font-bold text-ink-faint">
                    {n}
                </span>
            </dt>
            <dd>
                <div className="font-semibold text-ink-heading">{label}</div>
                <div className="mt-1">{children}</div>
            </dd>
        </div>
    );
}
