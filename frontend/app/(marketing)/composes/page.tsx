import type { Metadata } from "next";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Composes — Figaro Protocol",
    description:
        "What Figaro composes with: forums, offset markets, prediction markets, insurance, lending, payout routing, tax reporting, identity, storage, and messaging — the external compositional surface around the frozen kernel, with a worked carbon-offset walkthrough.",
};

export default function Composes() {
    return (
        <>
            <MarketingHero
                title="What the network composes with."
                lead={
                    <>
                        Figaro composes two ways. <strong>Internally</strong>, clauses assemble
                        into assemblies and mechanism contracts that extend the protocol
                        without altering the frozen kernel &mdash; permissionless at every
                        tier, covered in full on{" "}
                        <Link href="/builders/composability" className="underline">Composability</Link>.{" "}
                        <strong>Externally</strong>, composition happens through primitives
                        the kernel deliberately does not include &mdash; a dispute forum, an
                        offset market, a lending facility, and the rest below. This page
                        catalogues the external half.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    This page explains composition. To compose against the kernel, go to <Link href="/builders/composability" className="underline">/builders/composability</Link>.
                </p>
            </MarketingHero>

            <MarketingSection title="The kernel is narrow. The ecosystem composes around it.">
                <div className="border-l-2 border-default pl-6 mb-8">
                    <p className="text-sm text-ink-body leading-relaxed">
                        <strong>Implementation status.</strong> Currently wired: Kleros evidence export, XMTP messaging, IPFS storage, emissions disclosure attestations. Everything else below is a <strong>compositional surface</strong> &mdash; an architectural slot integrators can build against, with named vendors as illustrative examples rather than current integrations.
                    </p>
                </div>

                <p className="text-sm text-ink-body leading-relaxed">
                    Figaro&apos;s useful compositions are predominantly external: the kernel does not include a dispute forum, a carbon-offset market, a prediction market, an insurance pool, a lending facility, a tax-reporting service, an identity provider, a storage layer, or a messaging fabric. An assembly names which external surfaces it composes with. A concrete walkthrough first, then the surface area.
                </p>
            </MarketingSection>

            <MarketingSection title="Architectural example &mdash; carbon offset before settlement">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    A delivery process runs through its normal lifecycle. Before the buyer calls <code>resolveProcess</code>, the emissions clause has fired an attestation declaring <em>X</em> grams CO<sub>2</sub>e emitted. The buyer commits a sub-order against an offset seller registered with the assembly, adding the offset purchase to the same process before closing. (The offset seller is whichever counterparty the assembly admits &mdash; any bonded seller whose value-add is retirement.)
                </p>
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li><strong>UI surfaces the option.</strong> A live quote from a bonded offset seller registered against the assembly.</li>
                    <li><strong>Buyer commits a sub-order.</strong> Same <code>processId</code>, non-zero <code>cumulativeValue</code>, offset seller as seller. Buyer bonds <code>2&times;Y</code>; seller bonds 2&times; cumulative value (the <Link href="/papers/asymmetric-bonding" className="underline">N-party bonding equilibrium</Link>).</li>
                    <li><strong>Wallet handles any token swap.</strong> Multi-token bookkeeping is resolved before the commit; the kernel sees a single-currency sub-order.</li>
                    <li><strong>Seller delivers.</strong> Burns the offset and posts the burn receipt as an attestation against the sub-order.</li>
                    <li><strong>Buyer calls <code>resolveProcess</code> once.</strong> Main order and offset sub-order settle atomically. Offset receipt joins the evidence bundle.</li>
                </ol>
                <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                    Result: one settled process whose evidence bundle contains both the commerce record and an offset record verifiable against the burn receipt&apos;s on-chain attestation.
                </p>
            </MarketingSection>

            <MarketingSection title="Compositional surfaces.">
                <ul className="space-y-4">
                    <LabelledListRow label="Forums" uppercase>
                        <strong>Kleros, SIAC, ICC, courts.</strong> Parties&apos; agreement designates the forum; Figaro exports its evidence bundle there. Kernel does not adjudicate. Kleros wired today; other forums are off-chain referents named in the agreement. See <Link href="/papers/on-chain-evidence" className="underline">On-Chain Evidence, Off-Chain Adjudication</Link>.
                    </LabelledListRow>
                    <LabelledListRow label="Offsets" uppercase>
                        <strong>Any retirement provider that bonds as a seller.</strong> Architectural slot &mdash; the offset purchase is an ordinary bonded sub-order. Walkthrough above.
                    </LabelledListRow>
                    <LabelledListRow label="Prediction" uppercase>
                        <strong>Polymarket, Augur.</strong> Compositional target for outcome-resolution oracles that feed attestations gating a process.
                    </LabelledListRow>
                    <LabelledListRow label="Insurance" uppercase>
                        <strong>Nexus Mutual, Sherlock.</strong> Compositional target for smart-contract-failure cover, or cover on the real-world goods a process carries, priced against Figaro&apos;s evidence bundle. The bond itself is not an insurable position &mdash; a policy on bond forfeiture would hedge away the deterrent.
                    </LabelledListRow>
                    <LabelledListRow label="Lending" uppercase>
                        <strong>Aave, Compound, Morpho.</strong> Compositional target for ordinary treasury borrowing &mdash; a lender is a separate counterparty in a separate process. The bond itself is never financed: it is the party&apos;s own staked deterrent.
                    </LabelledListRow>
                    <LabelledListRow label="Payout routing" uppercase>
                        <strong>Disperse.</strong> Compositional target for post-settlement batch dispersal &mdash; one payment, many recipients, one transaction; a wallet splits its own receipts to earmarked addresses (fiscal remittance, savings, obligations), and the self-sovereign fiscal trail falls out as a byproduct. Canonical ownerless deployment, same address across chains; the devnet stack rehearses it with an interface-matching mock. Expanded below.
                    </LabelledListRow>
                    <LabelledListRow label="Tax / reporting" uppercase>
                        <strong>TaxBit, Koinly, Cryptio.</strong> Compositional target for jurisdictional reports derived from chain state. No reconciliation &mdash; the chain is the primary record.
                    </LabelledListRow>
                    <LabelledListRow label="Identity" uppercase>
                        <strong>DID:web, Polygon ID, Worldcoin.</strong> Compositional target for optional real-world identity attachment when the forum requires it.
                    </LabelledListRow>
                    <LabelledListRow label="Storage" uppercase>
                        <strong>IPFS.</strong> Off-chain agreement documents and large evidence artifacts. <code>agreementHash</code> anchors them on chain. Wired today.
                    </LabelledListRow>
                    <LabelledListRow label="Messaging" uppercase>
                        <strong>XMTP.</strong> Per-order encrypted handoff channels. Wired via <code>lib/handoff/</code>.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Payout routing." sectionId="payout-routing">
                <p className="text-sm text-ink-body leading-relaxed">
                    Compositional target for post-settlement batch dispersal through the composed public multisender: one payment, many recipients, one transaction. A wallet splits its own receipts to earmarked addresses (fiscal remittance, savings, obligations) in a single atomic transaction, and the self-sovereign fiscal trail falls out as a byproduct. Canonical ownerless deployment (Disperse), same address across chains; the devnet stack rehearses it with an interface-matching mock. Post-settlement composition is path-blind &mdash; both <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> deliver by ERC-20 transfer to the party&apos;s own address, so routing what you received works the same regardless of which settlement path carried it.
                </p>
            </MarketingSection>

            <MarketingSection title="How composition stays safe.">
                <p className="text-sm text-ink-body leading-relaxed">
                    An external mechanism that could override resolution, claw back a bond, or revoke a counterparty mid-process would import an escape hatch the kernel was designed to deny. The coordinator pattern gives three sufficient conditions under which composition preserves the bonding equilibrium: the external reads kernel state and emits its own evidence, but never writes to kernel state, never reverses a resolution, and never controls a bond. Integrators bringing a new external into an assembly should verify the composition against the same conditions. Property-side treatment, with the escape-hatch theorem it rests on: <Link href="/builders/composability" className="underline">Composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="More on composition" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary (internal composition).</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; what a clause is, the live registry inventory, and the public-vs-private data seam; the spec format and checklist live beside the registration form.</span>
                    </li>
                    <li>
                        <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>
                        <span className="text-ink-body"> &mdash; composition templates; an assembly names which external surfaces above it composes with.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>
                        <span className="text-ink-body"> &mdash; the contract-by-contract catalogue, including the funding, payout, and composition contracts named above.</span>
                    </li>
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Integrate</Link>
                        <span className="text-ink-body"> &mdash; <code>@figaro/sdk</code> read-path guidance for composition targets that read order state.</span>
                    </li>
                    <li>
                        <Link href="/security#disputes" className="text-ink-heading font-medium hover:underline">Security</Link>
                        <span className="text-ink-body"> &mdash; what a forum can and cannot do with the on-chain record.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
