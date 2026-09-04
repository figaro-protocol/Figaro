import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// Composition is ONE page: a "catalogue" vs "doctrine" split is an author's
// filing distinction no reader can see. It holds the hero (two ways to compose)
// plus the wired third-party list, forward-looking ("add others to help the
// ecosystem evolve") — nothing else. Do not restore the five-conditions
// apparatus, the kernel-invariant column, or the composer-duties list: they
// repeat the kernel (/kernel owns the mechanism) and ground page claims in
// paper propositions (the paper/frontend seam stays). Operational read/attach
// guidance lives in the SDK README, not here.
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
                        Composition happens two ways: <strong>internally</strong>, where <Link href="/clauses" className="underline">clauses</Link> assemble into <Link href="/assemblies" className="underline">assemblies</Link> and mechanism contracts like <Link href="/spec#AttestationCoordinator" className="underline">AttestationCoordinator</Link> extend the protocol without touching the kernel — catalogued on <Link href="/spec" className="underline">/spec</Link>; and <strong>externally</strong>, through the third-party products below.
                    </>
                }
            />

            <MarketingSection title="What is already wired in.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    Third-party products already wired &mdash; add others to help the ecosystem evolve. They are listed the way a deal meets them: first what carries value out of one market and into the next, then what a running process needs, then what the world outside the deal asks for. That first one carries more weight than convenience: each token denominates an economy of its own &mdash; a community&apos;s, a designer&apos;s, a stablecoin&apos;s &mdash; and a swap is the route between them. Value mobility, not enforcement, is what makes many small economies one network. A buyer holding one community&apos;s token can fund a bond in another&apos;s: the swap-funded coordinator converts at commitment, in one signed hop, and the process itself never sees a second unit. After resolution the receipts are the wallet&apos;s own, routed wherever it pleases. Nothing inside the kernel converts anything &mdash; mobility is composition&apos;s work, and it is what lets each economy keep its own unit while its value travels.
                </p>
                <ul className="space-y-4">
                    <LabelledListRow label="Token swap" uppercase>
                        <strong>Uniswap.</strong> A process is denominated in one token, but a buyer may hold another: swap through Uniswap and commit in the same transaction. The same single hop carries a settled payout onward &mdash; value captured in one market moves to the next without a pipeline into or out of the banking system.
                    </LabelledListRow>
                    <LabelledListRow label="Storage" uppercase>
                        <strong>IPFS.</strong> Off-chain agreement documents, public and private data, an audit trail and evidence.
                    </LabelledListRow>
                    <LabelledListRow label="Messaging" uppercase>
                        <strong>XMTP.</strong> Per-order encrypted handoff channels for public and private data exchange.
                    </LabelledListRow>
                    <LabelledListRow label="Multisender" id="multisender" uppercase>
                        <strong>Disperse.</strong> Post-settlement payout routing through the composed public multisender: one payment, many recipients, one transaction &mdash; it goes through whole or not at all. A settled wallet splits its own receipts the moment they land, to addresses it earmarked itself: a fiscal set-aside, savings, what it owes a supplier, a mutual-aid contribution. The split is the wallet&apos;s own arithmetic over its own tokens, done afterwards, on its own initiative, spending a balance it already holds &mdash; nothing in the deal routed any of it, and no clause computed it. The composed smart contract is the ownerless Disperse deployment &mdash; <code>0xD152f549545093347A162Dce210e7293f1452150</code>, the same address across chains, with no owner &mdash; and the call is its own <code>disperseToken(token, recipients, values)</code>, made by the wallet itself. Its entry, and the record key a deployment wires it under, are on <Link href="/spec#multisender" className="underline">/spec</Link>. What falls out is a self-sovereign fiscal trail nobody had to assemble later: the set-aside is dated, the recipient is named, and it stands on the same public record as the trade that paid for it.
                    </LabelledListRow>
                    <LabelledListRow label="Forums" uppercase>
                        The parties&apos; agreement designates the forum &mdash; a clause&apos;s <code>composes</code> block carries the forum&apos;s URL as configuration, never code, so any forum (an on-chain court, an arbitral institution, a national court) sits behind the same seam. Kleros is the wired example today; the seam is provider-agnostic. This is the exception rather than the norm: the bonded equilibrium is what makes most deals close without one, and a forum that was never composed still rules on the same record &mdash; the parties simply pick the venue afterwards. A composed forum weighs the record and the parties act on its ruling; it holds no key, and settlement stays where it always was &mdash; the buyer&apos;s close, and nothing else.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

        </>
    );
}
