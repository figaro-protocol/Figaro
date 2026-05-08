import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "About — Figaro Protocol",
    description: "Figaro is a permissionless, ownerless coordination protocol for self-enforcing agreements between strangers. Chain-agnostic; deployable on any EVM network.",
};

export default function About() {
    return (
        <>
            <MarketingHero
                title="What Figaro is &mdash; and what it is not."
                lead={
                    <>
                        Figaro is a small protocol that coordinates trade between strangers &mdash; the factotum of the network, holding collateral, executing commitments, releasing settlement. The sections below say what kinds of arrangements it accepts, what it deliberately refuses to do, and where the metaphor comes from.
                    </>
                }
            />

            <MarketingSection title="What the kernel will not do.">
                <ul className="space-y-3 text-base text-ink-body leading-relaxed list-disc pl-6">
                    <li>No owner, no admin, no pause function.</li>
                    <li>No protocol fee at the kernel.</li>
                    <li>FIG is not a governance token. It is a coordination Schelling point.</li>
                    <li>No arbitrator. No timeout.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Figaro is the factotum of the city.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    In Rossini&apos;s <em>Il Barbiere di Siviglia</em> (1816, libretto
                    by Sterbini, drawn from Beaumarchais&apos;s <em>Le Barbier de
                    Séville</em>, 1775), the character declares himself the
                    city&apos;s factotum in the &ldquo;Largo al factotum&rdquo; aria
                    &mdash; running errands, brokering favors, mediating between
                    parties of incommensurable standing, making commerce of the
                    whole household work without owning any of it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    The kernel is named for what it does: the factotum of the
                    network, the coordinator of everything without being the owner
                    of anything. <code>FigaroCore</code> holds collateral, executes
                    commitments, and discharges resolution &mdash; exactly the
                    coordination function the character performs, at protocol
                    scale.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The naming dates to Figaro-Original (Genovese &amp; Daliana,
                    March 2022). <strong>FIG</strong> is the name by which the
                    token is invoked, the way ETH and USDC are. See{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/VISION.md#appendix-project-lineage"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        VISION.md &quot;Appendix: Project Lineage&quot;
                    </a>{" "}
                    for the lineage.
                </p>
            </MarketingSection>

            <MarketingSection title="The kernel is narrow so the graph can be anything.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <code>FigaroCore</code> takes no position on currency,
                    jurisdiction, identity, arbitration, role structure,
                    price-discovery, or contribution metric. Every other
                    question lives above. Because the kernel is narrow, a
                    wide range of economic arrangements can be expressed on
                    top:
                </p>
                <ul className="space-y-2 text-base text-ink-body leading-relaxed list-disc pl-6 mb-4">
                    <li>A market-liberal graph where every role is priced at auction.</li>
                    <li>A cooperative graph where surplus routes back to contributors via programmatic shares.</li>
                    <li>An Islamic-finance graph that forbids riba and structures returns through bonded profit-sharing.</li>
                    <li>A mutual-aid graph where bonds are reciprocal rather than monetary, denominated in a community currency.</li>
                    <li>A diaspora-network graph where jurisdictional identity is replaced by a cryptographic key and a social-graph attestation.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    Same kernel underneath all of them. The ideological commitments
                    live in the assembly &mdash; in which roles it defines, which
                    mechanisms it invokes, which clauses it requires. The kernel
                    is ideologically agnostic; the graph is the politics.
                </p>
                <p className="text-sm text-ink-muted mt-6">
                    Mechanism derivation:{" "}
                    <Link href="/protocol" className="underline">/protocol</Link>.
                    Reading paths by discipline:{" "}
                    <Link href="/cryptoeconomics" className="underline">/cryptoeconomics</Link>.
                    Composition treatment:{" "}
                    <Link href="/composability" className="underline">/composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Three layers carry the equilibrium.">
                <p className="text-base text-ink-body leading-relaxed">
                    Economic (asymmetric bonding makes defection irrational), social
                    (multi-party processes bind contributors together via the
                    weakest-link subgame), and legal (immutable evidence for
                    off-chain adjudication). Full derivation on the{" "}
                    <Link href="/protocol#enforcement" className="underline">Protocol</Link>{" "}
                    page.
                </p>
            </MarketingSection>

            <MarketingSection title="Chain-agnostic.">
                <p className="text-base text-ink-body leading-relaxed">
                    The kernel deploys for any EVM-compatible network. It does not establish trust; it inherits it from the network underneath &mdash; from the network&apos;s consensus, its tamper-evident history, its deterministic execution, its finality guarantees. Different chain, different security assumptions; same kernel, same invariants once those assumptions hold. Canonical deployments are listed in the{" "}
                    <Link href="/spec" className="underline">Specifications</Link>{" "}
                    index.
                </p>
            </MarketingSection>

            <MarketingSection title="Kernel, protocol, runtime.">
                <p className="text-base text-ink-body leading-relaxed">
                    Three composable tiers: <Link href="/spec" className="underline">kernel</Link> (the irreducible settlement primitive), <Link href="/protocol" className="underline">protocol</Link> (kernel + extension doctrine + public graphs), and <Link href="/builders" className="underline">runtime</Link> (UI surfaces + builder tools). Each composes on top of the one below. Mechanism derivation lives on <Link href="/protocol" className="underline">/protocol</Link>; the kernel surface is documented at <Link href="/spec" className="underline">/spec</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="MIT. Source-available." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/LICENSE"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        MIT
                    </a>
                    . Source:{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        github.com/figaro-protocol/Figaro-Prototype2
                    </a>
                    .
                </p>
            </MarketingSection>
        </>
    );
}
