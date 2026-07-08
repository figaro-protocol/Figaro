import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Builders — Figaro Protocol",
    description:
        "Figaro is a protocol you extend, not an app you can be locked out of. Adding a clause is permissionless, and 60% of the token supply rewards the authors of clauses that get used.",
    openGraph: {
        title: "Builders — Figaro Protocol",
        description:
            "Extend the protocol without asking. If people use what you built, it pays you back.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Builders — Figaro Protocol",
        description:
            "Extend the protocol without asking. If people use what you built, it pays you back.",
    },
};

export default function BuildersPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                Build on a protocol no one owns.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Extend it without asking. If people use what you built, it pays you back.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most platforms you build on belong to a company. It can change the rules, deprecate your work, or take a cut &mdash; and you have no say, because the platform is theirs.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Figaro is structurally different. Its core &mdash; the part that holds the money and settles the deal &mdash; is finished, frozen, and owned by no one. It cannot be changed, paused, or pointed at new rules; not by a company, not by the people who wrote it. There is nothing to be locked out of, because there is no one to do the locking.
            </p>
            <h2 className="text-heading-h2 text-ink-heading mt-12 mb-4">
                Five builders, one substrate.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-6">
                Every layer above the frozen kernel is permissionless to extend. Five distinct roles do that work:
            </p>
            <dl className="space-y-6 text-base mb-8">
                <div>
                    <dt className="font-semibold text-ink-heading">Contract authors</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Write new mechanism contracts above the kernel &mdash; auctions, registries, attestation coordinators, role resolvers. Anyone can deploy a new contract; nothing about the existing protocol changes. The kernel is frozen; everything else is permissionless.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Clause authors</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Define new attestation content types &mdash; what a deal contains, what counts as delivered, what a disclosure must include. Each clause is registered permissionlessly: write it, register it, it is live. Sixty percent of the FIG supply (600 million) is reserved for this group, distributed by a fixed formula that measures real adoption across distinct counterparty pairs.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Assembly authors</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Compose clauses and roles into multi-party bonded processes. The Designer tool produces drafts on a canvas; publishing anchors the assembly template in the AssemblyRegistry, parallel to the clause registry. Assemblies are how new use cases &mdash; delivery, supply chain, freelance work &mdash; get expressed in the protocol&apos;s vocabulary.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Token issuance</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Deploy new tokens using protocol primitives. The kernel is token-agnostic for bonding and settlement; any ERC-20 can be the unit of a deal. FIG itself follows this pattern &mdash; a Schelling-point cryptocurrency denominated in the trade the substrate secures.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Humans and agents</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Every layer above can be authored by software as easily as by people. The protocol is actor-neutral &mdash; a wallet is a wallet, a signature is a signature. Tooling for human builders is tooling for autonomous agents, and the same.
                    </dd>
                </div>
            </dl>
            <p className="text-base text-ink-body leading-relaxed mb-12">
                Be clear-eyed about the stage. Figaro is a working protocol, still in development &mdash; not yet on a public network, <Link href="/security#verification" className="text-ink-heading font-medium hover:underline">not yet independently audited</Link>. The reward tranches unlock at years two, five, and nine &mdash; built to reward durable contribution, not a quick flip. What you can do today is read the code, write a clause against the live off-chain validator, and watch the whole thing settle a deal end to end on a local network.
            </p>
            <h2 className="text-base font-semibold text-ink-heading mb-4">
                Where to start
            </h2>
            <ul className="space-y-3 text-base">
                <li>
                    <Link href="/builders/designer" className="text-ink-heading font-medium hover:underline">
                        The Designer
                    </Link>
                    <span className="text-ink-body"> &mdash; compose a bonded process on a canvas and edit its agreement clauses.</span>
                </li>
                <li>
                    <Link href="/clauses" className="text-ink-heading font-medium hover:underline">
                        Clauses
                    </Link>
                    <span className="text-ink-body"> &mdash; the validation architecture, the reference clauses, and the authoring checklist.</span>
                </li>
                <li>
                    <Link href="/integrate" className="text-ink-heading font-medium hover:underline">
                        The SDK
                    </Link>
                    <span className="text-ink-body"> &mdash; <code>@figaro/core</code>: ABIs, event parsers, content encoders, commitment builders.</span>
                </li>
                <li>
                    <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                        The contract surface
                    </Link>
                    <span className="text-ink-body"> &mdash; every contract above the kernel, with its source link and verification status.</span>
                </li>
                <li>
                    <Link href="/security#builders-registries" className="text-ink-heading font-medium hover:underline">
                        Security posture for authors
                    </Link>
                    <span className="text-ink-body"> &mdash; first-write-wins registry binding, merkle-bound attestations, three-tier anti-spam posture, and what an immutable v1 means for how you ship.</span>
                </li>
                <li>
                    <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">
                        Composability
                    </Link>
                    <span className="text-ink-body"> &mdash; the coordinator pattern, the three extension tiers, and the kernel-vs-author boundary.</span>
                </li>
                <li>
                    <Link href="/agents" className="text-ink-heading font-medium hover:underline">
                        Agents
                    </Link>
                    <span className="text-ink-body"> &mdash; how autonomous agents participate through the same primitives humans do; ERC-8004 interop and how an operator transacts.</span>
                </li>
                <li>
                    <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">
                        The reward
                    </Link>
                    <span className="text-ink-body"> &mdash; how clause authors get paid: 60% of the FIG supply, by a fixed formula, for clauses that get used.</span>
                </li>
            </ul>
        </section>
    );
}
