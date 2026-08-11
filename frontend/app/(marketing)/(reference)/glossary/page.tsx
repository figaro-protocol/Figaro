import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Glossary — Figaro Protocol",
    description:
        "Plain-language definitions of the fixed vocabulary used across the site — agent, buyer, seller, clause, assembly, composition, bonded commitment, stake, the florin, kernel, operator, attestation, process, settlement, gas, stablecoin-class tokens, and wallet — each drawn from how the site itself already uses the word.",
};

interface Term {
    id: string;
    term: string;
    definition: React.ReactNode;
    readMore: React.ReactNode;
}

const TERMS: Term[] = [
    {
        id: "agent",
        term: "Agent",
        definition:
            "Whoever runs a wallet in software rather than at a keyboard &mdash; a courier's dispatcher, a pricing bot, a long-running service. The kernel checks a signature, not who or what produced it, so an agent signs, bonds, and settles exactly as a person does.",
        readMore: <Link href="/agents" className="hover:underline">Agents</Link>,
    },
    {
        id: "assembly",
        term: "Assembly",
        definition:
            "A ready-made shape for a deal — who is involved, and how the payment splits between them — that any seller can reuse without designing it from scratch. Someone composes it once; every seller who fits the shape can offer it.",
        readMore: <Link href="/assemblies" className="hover:underline">Assemblies</Link>,
    },
    {
        id: "attestation",
        term: "Attestation",
        definition:
            "A timestamped piece of evidence posted during a deal — a delivery confirmation, an emissions disclosure, whatever a clause defines — bound on-chain to the signed agreement it belongs to. The chain itself keeps only its fingerprint, never the content.",
        readMore: <Link href="/clauses" className="hover:underline">Clauses</Link>,
    },
    {
        id: "bonded-commitment",
        term: "Bonded commitment",
        definition:
            "One deal secured by the lockbox mechanism: both sides post a stake bigger than the deal is worth, so honoring it always beats cheating. This is the base unit everything else in the protocol is built from.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "buyer",
        term: "Buyer",
        definition:
            "The party who pays for a deal and is the only one who can close it out — releasing every locked stake once satisfied. Any wallet can be a buyer.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "clause",
        term: "Clause",
        definition:
            "One reusable term a deal can be built from — how a dispute gets escalated, how emissions get reported, how a delivery address gets handled — written once and available to anyone drafting an agreement, the same way an ordinary contract is assembled from clauses.",
        readMore: <Link href="/clauses" className="hover:underline">Clauses</Link>,
    },
    {
        id: "composition",
        term: "Composition",
        definition:
            "Attaching an outside system — a dispute forum, a payout router, a swap venue, another on-chain contract — to a deal without changing the kernel that secures it. Internal composition extends the protocol itself (new clauses, new assemblies); external composition reaches things the kernel deliberately leaves out.",
        readMore: <Link href="/composition" className="hover:underline">Composition</Link>,
    },
    {
        id: "florin",
        term: "The florin (FLORIN, ƒ)",
        definition:
            "The protocol's own coordination token — a focal point participants can rally around, not a fee, not yield, not governance over anyone's deal. Its worth depends on whether the network gets used, and on nothing else.",
        readMore: <Link href="/rpgf" className="hover:underline">RPGF</Link>,
    },
    {
        id: "gas",
        term: "Gas",
        definition:
            "The network's own running charge for every step on Ethereum, paid in ETH — a small amount alongside whatever token a deal itself settles in. The price moves with the network's demand, not with anything Figaro sets or charges.",
        readMore: <Link href="/faq#compatibility" className="hover:underline">FAQ</Link>,
    },
    {
        id: "kernel",
        term: "Kernel",
        definition:
            "FigaroCore — the small program that holds every bonded commitment and settles a deal the instant its buyer confirms. It has no owner, no admin, no pause button, and no upgrade key.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "operator",
        term: "Operator",
        definition:
            "Whoever controls a wallet's signing key on its underlying asset's behalf &mdash; a person or an autonomous program alike; which of the two it is changes nothing in the mechanism. A person running their own asset is simply that asset's buyer or seller; the term matters when a wallet is run for the asset by someone or something else.",
        readMore: <Link href="/faq#agents" className="hover:underline">FAQ</Link>,
    },
    {
        id: "process",
        term: "Process",
        definition:
            "The whole bonded deal one buyer opens — one buyer, one or more sellers chained together — settling together, atomically, or not at all.",
        readMore: <Link href="/faq#multi-party" className="hover:underline">FAQ</Link>,
    },
    {
        id: "seller",
        term: "Seller",
        definition:
            "A value-adder in a deal — a wallet that adds something (a good, a service, a delivery step) and posts its own stake against the value it adds. Any wallet can be a seller, and a chain of deals can have several.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "settlement",
        term: "Settlement",
        definition:
            "The moment a deal closes: the buyer signs the resolution, and every stake and payment in the process moves at once, in a single transaction — all of it, or none of it.",
        readMore: <Link href="/faq#custody" className="hover:underline">FAQ</Link>,
    },
    {
        id: "stablecoin-class",
        term: "Stablecoin-class token",
        definition:
            "A token designed to hold a steady price against a reference currency — the kind of ERC-20 most deals on Figaro settle in, so an amount worth about a dollar today is still worth about the same next week.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "stake",
        term: "Stake / bond",
        definition:
            "The extra tokens each side locks beyond what the deal is worth — twice the payment for the buyer, twice the cumulative value for the seller. It comes home intact every time the deal closes honestly; it stays locked, benefiting no one, if a side walks away.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "wallet",
        term: "Wallet",
        definition:
            "An app that holds your digital tokens and signs for you — like a banking app, except no bank runs it, and you alone hold the key.",
        readMore: <Link href="/members" className="hover:underline">Members</Link>,
    },
];

export default function Glossary() {
    return (
        <>
            <MarketingHero
                title="Glossary."
                lead={
                    <>
                        The fixed vocabulary used across this site, in plain language &mdash; each entry drawn from how the site itself already uses the word, with a link to where it is treated in full.
                    </>
                }
            />

            <MarketingSection bottomPad="wide">
                <dl className="space-y-6">
                    {TERMS.map(({ id, term, definition, readMore }) => (
                        <div key={id} id={id} className="border-l-2 border-default pl-6 scroll-mt-24">
                            <dt className="text-base font-semibold text-ink-heading mb-1">{term}</dt>
                            <dd className="text-sm text-ink-body leading-relaxed">
                                {definition}
                                <span className="block mt-1 text-ink-muted">Read more: {readMore}</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </MarketingSection>
        </>
    );
}
