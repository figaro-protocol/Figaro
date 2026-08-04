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
            <p className="text-sm text-ink-muted leading-relaxed mb-8">
                This page orients &mdash; it doesn&apos;t specify.{" "}
                <Link href="/clauses" className="text-ink-heading font-medium hover:underline">/clauses</Link> and{" "}
                <Link href="/composes" className="text-ink-heading font-medium hover:underline">/composes</Link> teach
                the composition surface itself; <Link href="/integrate" className="text-ink-heading font-medium hover:underline">/integrate</Link> is
                the how-to. <Link href="/spec" className="text-ink-heading font-medium hover:underline">/spec</Link> and{" "}
                <Link href="/security" className="text-ink-heading font-medium hover:underline">/security</Link> are
                the adversarial reference &mdash; dense by design, every guarantee there stated beside its caveat.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most platforms you build on belong to a company. It can change the rules, deprecate your work, or take a cut &mdash; and you have no say, because the platform is theirs.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Figaro is structurally different. Its core &mdash; the part that holds the funds and settles the deal &mdash; is finished, frozen, and owned by no one. It cannot be changed, paused, or pointed at new rules; not by a company, not by the people who wrote it. There is nothing to be locked out of, because there is no one to do the locking.
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
                        Define new attestation content types &mdash; what a deal contains, what counts as delivered, what a disclosure must include. Each clause is registered permissionlessly: write it, register it, it is live, and it earns from the protocol&apos;s reward pool by real, measured adoption &mdash; see <Link href="/artifact-rewards" className="text-ink-heading font-medium hover:underline">how clause authors and assembly designers get paid</Link>.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Assembly authors</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Compose clauses and roles into multi-party bonded processes. The Designer tool produces drafts on a canvas; publishing anchors the assembly template in the AssemblyRegistry, parallel to the clause registry. Assemblies are how new use cases &mdash; delivery, supply chain, freelance work &mdash; get expressed in the protocol&apos;s vocabulary, and they earn from the same reward pool as clauses, by the same formula.
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold text-ink-heading">Token issuance</dt>
                    <dd className="text-ink-body leading-relaxed mt-1">
                        Deploy new tokens using protocol primitives. The kernel is token-agnostic for bonding and settlement; any ERC-20 can be the unit of a deal. The florin itself follows this pattern &mdash; a Schelling-point cryptocurrency denominated in the trade the substrate secures.
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
                Be clear-eyed about the stage. Figaro is a working protocol, still in development &mdash; <Link href="/security#verification" className="text-ink-heading font-medium hover:underline">not yet independently audited</Link>. The reward pays out once a year for nine years, weighted toward later years once the evidence is deepest &mdash; full schedule at <Link href="/artifact-rewards" className="text-ink-heading font-medium hover:underline">artifact rewards</Link>. There is no hosted public testnet yet, so &ldquo;watch it settle end to end&rdquo; means running a local network yourself: clone <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">the repository</a>, run <code>./scripts/devup.sh</code> to bring up Anvil, IPFS, and the deployed protocol stack, then drive a commit and a resolve against the kernel directly using the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">SDK README&apos;s</a> <code>commit</code>/<code>resolveProcess</code> walkthrough. The worked, narrated demonstration is <a href="https://github.com/figaro-protocol/Figaro/tree/main/examples/settle-a-deal" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline"><code>examples/settle-a-deal</code></a> &mdash; one script, run against that same local network, that discovers an anchored composition from the registries, signs it on both sides, commits, attests, resolves, and asserts the exact payouts against balances it reads back off the chain (the Playwright e2e suite, <code>cd frontend &amp;&amp; npm run test:e2e:devnet</code>, does the same through the browser).
            </p>

            <h2 className="text-base font-semibold text-ink-heading mb-4">
                Where to start &mdash; in order
            </h2>
            <ol className="space-y-3 text-base list-decimal pl-5 mb-10">
                <li>
                    <Link href="/clauses" className="text-ink-heading font-medium hover:underline">
                        Clauses
                    </Link>
                    <span className="text-ink-body"> &mdash; what a clause is, the live registry inventory, and the public-vs-private data seam; the spec format and checklist live beside the registration form. Start here: everything above composes from these.</span>
                </li>
                <li>
                    <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">
                        Assemblies
                    </Link>
                    <span className="text-ink-body"> &mdash; clauses wired into a multi-order process, anchored on <code>AssemblyRegistry</code>.</span>
                </li>
                <li>
                    <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">
                        Composability
                    </Link>
                    <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                </li>
                <li>
                    <Link href="/composes" className="text-ink-heading font-medium hover:underline">
                        Composes
                    </Link>
                    <span className="text-ink-body"> &mdash; the external composition catalogue: forums, offset markets, payout routing, and what &ldquo;wired&rdquo; vs &ldquo;architectural slot&rdquo; means today.</span>
                </li>
                <li>
                    <Link href="/integrate" className="text-ink-heading font-medium hover:underline">
                        Integrate
                    </Link>
                    <span className="text-ink-body"> &mdash; <code>@figaro/sdk</code>: ABIs, event parsers, content encoders, commitment builders, the two-settlement-path read recipe.</span>
                </li>
                <li>
                    <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                        Specifications
                    </Link>
                    <span className="text-ink-body"> &mdash; every contract above the kernel, with its source link and verification status.</span>
                </li>
            </ol>

            <h2 className="text-base font-semibold text-ink-heading mb-4">
                Do it now
            </h2>
            <ul className="space-y-3 text-base mb-10">
                <li>
                    <Link href="/builders/designer" className="text-ink-heading font-medium hover:underline">
                        The Designer
                    </Link>
                    <span className="text-ink-body"> &mdash; compose a bonded process on a canvas and edit its agreement clauses.</span>
                </li>
                <li>
                    <Link href="/builders/clauses" className="text-ink-heading font-medium hover:underline">
                        Register a clause
                    </Link>
                    <span className="text-ink-body"> &mdash; paste a spec, validate it against the live off-chain check, and anchor it on the <code>ClauseRegistry</code>.</span>
                </li>
            </ul>

            <h2 className="text-base font-semibold text-ink-heading mb-4">
                The adversarial reference
            </h2>
            <ul className="space-y-3 text-base">
                <li>
                    <Link href="/security#builders-registries" className="text-ink-heading font-medium hover:underline">
                        Security
                    </Link>
                    <span className="text-ink-body"> &mdash; first-write-wins registry binding, merkle-bound attestations, three-tier anti-spam posture, and what an immutable v1 means for how you ship &mdash; every guarantee stated beside its caveat.</span>
                </li>
                <li>
                    <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">
                        Asymmetric Bonding and Buyer Dominance
                    </Link>
                    <span className="text-ink-body"> &mdash; the mechanism-design paper: the game-theoretic derivation of why cooperation is the dominant strategy under the 2&times; bonding ratio. <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">Funding &amp; working groups</Link> covers how work on the substrate organizes and pays for itself, not the mechanism design itself.</span>
                </li>
            </ul>
        </section>
    );
}
