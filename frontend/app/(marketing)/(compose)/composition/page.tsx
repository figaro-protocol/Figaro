import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// AUDITED + MERGED 2026-08-05: this page absorbed /builders/composability (the
// split was an author's filing distinction — "catalogue" vs "doctrine" — that no
// reader could see; maintainer ruled ONE page). RULED + REWRITTEN BY THE MAINTAINER
// 2026-08-06, final form: the hero (two ways to compose) plus the wired
// third-party list, forward-looking ("add others to help the ecosystem
// evolve") — nothing else. The five-conditions apparatus, the kernel-invariant
// column, and the composer-duties list were DELETED: they repeated the kernel
// (/kernel owns the mechanism) and grounded page claims in paper propositions
// (the paper/frontend seam stays). Operational read/attach guidance lives in
// the SDK README, not here.
export const metadata: Metadata = withOg({
    title: "Composition — Figaro Protocol",
    description:
        "What composes with Figaro — an open category, not a catalogue.",
});

export default function Composes() {
    return (
        <>
            <MarketingHero
                title="What composes with Figaro."
                lead={
                    <>
                        Composition happens two ways: <strong>internally</strong>, where clauses assemble into assemblies and mechanism contracts like <Link href="/spec#AttestationCoordinator" className="underline">AttestationCoordinator</Link> extend the protocol without touching the kernel — catalogued on <Link href="/spec" className="underline">/spec</Link>; and <strong>externally</strong>, through the third-party products below.
                    </>
                }
            />

            <MarketingSection title="The ecosystem composes around the kernel.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    Third-party products already wired &mdash; add others to help the ecosystem evolve:
                </p>
                <ul className="space-y-4">
                    <LabelledListRow label="Forums" uppercase>
                        The parties&apos; agreement designates the forum &mdash; a clause&apos;s <code>composes</code> block carries the forum&apos;s URL as configuration, never code, so any forum (an on-chain court, an arbitral institution, a national court) sits behind the same seam. Kleros is the wired example today; the seam is provider-agnostic.
                    </LabelledListRow>
                    <LabelledListRow label="Storage" uppercase>
                        <strong>IPFS.</strong> Off-chain agreement documents, public and private data, an audit trail and evidence.
                    </LabelledListRow>
                    <LabelledListRow label="Messaging" uppercase>
                        <strong>XMTP.</strong> Per-order encrypted handoff channels for public and private data exchange.
                    </LabelledListRow>
                    <LabelledListRow label="Token swap" uppercase>
                        <strong>Uniswap.</strong> A process is denominated in one token, but a buyer may hold another: swap through Uniswap and commit in the same transaction.
                    </LabelledListRow>
                    <LabelledListRow label="Multisender" uppercase>
                        <strong>Disperse.</strong> Post-settlement payout routing through the composed public multisender: one payment, many recipients, one transaction &mdash; it goes through whole or not at all. A settled wallet splits its own receipts the moment they land, to addresses it earmarked itself: a fiscal set-aside, savings, what it owes a supplier, a mutual-aid contribution. Nothing in the deal routed any of it and no clause computed it &mdash; the split is the wallet&apos;s own arithmetic over its own tokens, done afterwards, on its own initiative, spending a balance it already holds (<code>frontend/lib/composition/payoutRouting.ts</code>). What falls out is a self-sovereign fiscal trail nobody had to assemble later: the set-aside is dated, the recipient is named, and it stands on the same public record as the trade that paid for it.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

        </>
    );
}
