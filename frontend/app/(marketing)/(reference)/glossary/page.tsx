import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Glossary — Figaro Protocol",
    description:
        "Plain-language definitions of the fixed vocabulary used across the site — agent, buyer, seller, clause, assembly, composition, bonded commitment, stake, the florin, kernel, operator, order, attestation, process, settlement, gas, the four hashes, keccak256, EIP-712, ECDSA, IPFS and its CID, stablecoin-class tokens, and wallet — each drawn from how the site itself already uses the word.",
});

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
            "Whoever runs a wallet in software rather than at a keyboard — a courier's dispatcher, a pricing bot, a long-running service. The kernel reads a signature, never a species, so an agent signs, bonds, and settles exactly as a person does.",
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
        id: "ecdsa",
        term: "ECDSA",
        definition:
            "The signature scheme an Ethereum account signs with. A signature made this way shows that the holder of one particular key approved one exact piece of text, and anyone can check it against that account's address without ever seeing the key. Recovering the address from the signature is the only identity check the kernel makes.",
        readMore: <Link href="/faq#keys" className="hover:underline">FAQ</Link>,
    },
    {
        id: "eip-712",
        term: "EIP-712",
        definition:
            "The Ethereum convention for signing structured data rather than a loose blob of text: the fields of what is being agreed are laid out and fingerprinted in a fixed, published order, so the same deal always produces the same thing to sign and one changed field produces a different one. Buyer and seller each sign their commitment this way.",
        readMore: <Link href="/faq#signing" className="hover:underline">FAQ</Link>,
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
        id: "hashes",
        term: "The four hashes",
        definition: (
            <>
                <p className="mb-3">
                    A clause spec produces four separate hashes, and mixing them up is the costliest authoring mistake there is — registration is permanent and first-write-wins.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Hash</th>
                                <th scope="col" className="py-2 pr-4">Computed over</th>
                                <th scope="col" className="py-2">If it doesn&apos;t match</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4">idHash — the clause id</td>
                                <td className="py-2 pr-4">the clause&apos;s name and version, and nothing else</td>
                                <td className="py-2">You are pointing at a different clause in the registry — and the binding you made is permanent.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">contentHash</td>
                                <td className="py-2 pr-4">the whole document, exactly as written — the half people read and the half programs parse</td>
                                <td className="py-2">The document is not the one that was anchored; the batch settlement path refuses to settle against it.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">agreementHash</td>
                                <td className="py-2 pr-4">every filled-in term of one deal, folded together into a single fingerprint</td>
                                <td className="py-2">Buyer and seller are not signing the same deal, and the kernel will not accept the commitment.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">compositionHash</td>
                                <td className="py-2 pr-4">the set of clauses a designer composed into an assembly</td>
                                <td className="py-2">The shape being offered is not the shape that was published under that name.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </>
        ),
        readMore: <Link href="/clauses#what-the-hash-covers" className="hover:underline">Clauses</Link>,
    },
    {
        id: "ipfs",
        term: "IPFS and its CID",
        definition:
            "The storage the documents live in: a network where a file is addressed by a fingerprint of its own contents — the CID — rather than by whose server it sits on. Ask for a CID and you can only ever get that exact file back; change one character and it is a different CID. You pin what you publish on a node you choose, and unpinning it stops your node serving it.",
        readMore: <Link href="/faq#privacy" className="hover:underline">FAQ</Link>,
    },
    {
        id: "keccak256",
        term: "keccak256",
        definition:
            "The fingerprinting function Ethereum uses: hand it a document of any length and it returns the same 32 bytes every time, while a single changed character returns something entirely different. It is what lets the chain hold a fingerprint of an agreement without holding the agreement.",
        readMore: <Link href="/faq#privacy" className="hover:underline">FAQ</Link>,
    },
    {
        id: "kernel",
        term: "Kernel",
        definition:
            "FigaroCore — the small program that holds every bonded commitment and settles a deal the instant its buyer confirms. It has no owner, no admin, no pause button, and no upgrade key.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "member",
        term: "Member",
        definition:
            "A wallet that has published its profile on the members registry with a live ETH deposit — the same one deposit whether it buys, sells, or both. A member's profile carries both sides: what it offers as a seller, and, as a buyer, which of the data its own deals produce it offers for sale. The deposit is a member's, never a seller's alone; the reward mechanism reads it on the seller of record of each settled deal.",
        readMore: <Link href="/members" className="hover:underline">Members</Link>,
    },
    {
        id: "operator",
        term: "Operator",
        definition:
            "Whoever controls a wallet's signing key on its underlying asset's behalf — a person or an autonomous program alike; which of the two it is changes nothing in the mechanism. A person running their own asset is simply that asset's buyer or seller; the term matters when a wallet is run for the asset by someone or something else.",
        readMore: <Link href="/faq#agents" className="hover:underline">FAQ</Link>,
    },
    {
        id: "order",
        term: "Order",
        definition:
            "One buyer-and-seller commitment — the signed unit the kernel bonds. A deal with several value-adders chains several orders into one process, each order adding its own seller and its own stake.",
        readMore: <Link href="/kernel" className="hover:underline">Kernel</Link>,
    },
    {
        id: "process",
        term: "Process",
        definition:
            "The whole bonded deal one buyer opens — the chain of orders behind it, one buyer, one or more sellers — settling together, atomically, or not at all.",
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
                        The fixed vocabulary used across this site, in plain language — each entry drawn from how the site itself already uses the word, with a link to where it is treated in full.
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
