import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "About — Figaro Protocol",
    description: "Figaro is a permissionless, ownerless coordination protocol for self-enforcing agreements between strangers. Chain-agnostic; deployable on any EVM network.",
};

export default function About() {
    return (
        <>
            <MarketingHero
                eyebrow="About"
                title="The factotum of the network."
                lead={
                    <>
                        Figaro is a coordination protocol &mdash; closer to TCP/IP than
                        to a bank or a DEX. A primitive for enforcing bilateral
                        agreements between strangers, deployable on any EVM network,
                        permissionless and ownerless.
                    </>
                }
            />

            <MarketingSection eyebrow="The name" title="Figaro is the factotum of the city.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    In Rossini&apos;s <em>Il Barbiere di Siviglia</em> (1816, libretto
                    by Sterbini, drawn from Beaumarchais&apos;s <em>Le Barbier de
                    Séville</em>, 1775), the character declares himself the
                    city&apos;s factotum in the &ldquo;Largo al factotum&rdquo; aria
                    &mdash; running errands, brokering favors, mediating between
                    parties of incommensurable standing, making commerce of the
                    whole household work without owning any of it.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The kernel is named for what it does: the factotum of the
                    network, the coordinator of everything without being the owner
                    of anything. <code>FigaroCore</code> holds collateral, executes
                    commitments, and discharges resolution &mdash; exactly the
                    coordination function the character performs, at protocol
                    scale.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
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

            <MarketingSection eyebrow="Three tiers" title="Kernel, protocol, runtime.">
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">
                            <Link href="/spec" className="hover:underline">Kernel</Link>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            <code>FigaroCore</code>. The irreducible settlement
                            primitive &mdash; two external functions, three mappings,
                            zero owners. EIP-712 dual-signed commitments;
                            asymmetric bonding; direct transfer at resolution.
                        </dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">
                            <Link href="/protocol" className="hover:underline">Protocol</Link>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Kernel + extension doctrine + public graphs. The
                            permissionless surface: attestation coordinator,
                            schema registry, canonical validators, token, batch
                            verifier. Mechanism derivation and the contract-law
                            mapping live here.
                        </dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">
                            <Link href="/builders" className="hover:underline">Runtime</Link>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Protocol + semantic layer + builder surfaces + UI.
                            The runtime is not a product. It is the composable
                            layer in which assemblies are rendered, roles are
                            filled, and processes play out.
                        </dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-6">
                    Each commitment carries the structural shape of a contract
                    &mdash; consideration, terms, formation, acceptor, discharge.
                    Full glossary on the{" "}
                    <Link href="/protocol" className="underline">Protocol</Link>{" "}
                    page.
                </p>
            </MarketingSection>

            <MarketingSection
                eyebrow="Ideological agnosticism"
                title="The kernel is narrow so the graph can be anything."
            >
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    <code>FigaroCore</code> takes no position on currency,
                    jurisdiction, identity, arbitration, role structure,
                    price-discovery, or contribution metric. Every other
                    question lives above. Because the kernel is narrow, a
                    wide range of economic arrangements can be expressed on
                    top:
                </p>
                <ul className="space-y-2 text-base text-gray-700 leading-relaxed list-disc pl-6 mb-4">
                    <li>A market-liberal graph where every role is priced at auction.</li>
                    <li>A cooperative graph where surplus routes back to contributors via programmatic shares.</li>
                    <li>An Islamic-finance graph that forbids riba and structures returns through bonded profit-sharing.</li>
                    <li>A mutual-aid graph where bonds are reciprocal rather than monetary, denominated in a community currency.</li>
                    <li>A diaspora-network graph where jurisdictional identity is replaced by a cryptographic key and a social-graph attestation.</li>
                </ul>
                <p className="text-base text-gray-700 leading-relaxed">
                    Same kernel underneath all of them. The ideological commitments
                    live in the assembly &mdash; in which roles it defines, which
                    mechanisms it invokes, which clauses it requires. The kernel
                    is ideologically agnostic; the graph is the politics.
                </p>
                <p className="text-sm text-gray-600 mt-6">
                    Mechanism derivation:{" "}
                    <Link href="/protocol" className="underline">/protocol</Link>.
                    Reading paths by discipline:{" "}
                    <Link href="/cryptoeconomics" className="underline">/cryptoeconomics</Link>.
                    Composition treatment:{" "}
                    <Link href="/composability" className="underline">/composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Substrate" title="Chain-agnostic.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The kernel is a Solidity 0.8.26 contract. It compiles and
                    deploys for any EVM network. Canonical deployments are listed
                    in the{" "}
                    <Link href="/spec" className="underline">Specifications</Link>{" "}
                    index.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The chain itself is the kernel&apos;s substrate. <code>FigaroCore</code>{" "}
                    does not establish trust; it inherits it from the network
                    underneath &mdash; from the network&apos;s consensus, its
                    tamper-evident history, its deterministic execution, and its
                    finality guarantees. Different chain, different security
                    assumptions; same kernel, same invariants once those
                    assumptions hold.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Enforcement" title="Three layers carry the equilibrium.">
                <p className="text-base text-gray-700 leading-relaxed">
                    Economic (asymmetric bonding makes defection irrational), social
                    (multi-party processes bind contributors together via the
                    weakest-link subgame), and legal (immutable evidence for
                    off-chain adjudication). Full derivation on the{" "}
                    <Link href="/protocol#enforcement" className="underline">Protocol</Link>{" "}
                    page.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Posture" title="What the kernel will not do.">
                <ul className="space-y-3 text-base text-gray-700 leading-relaxed list-disc pl-6">
                    <li>No owner, no admin, no pause function.</li>
                    <li>No protocol fee at the kernel.</li>
                    <li>FIG is not a governance token. It is a coordination Schelling point.</li>
                    <li>No arbitrator. No timeout.</li>
                </ul>
            </MarketingSection>

            <MarketingSection eyebrow="License" title="MIT. Source-available." bottomPad="wide">
                <p className="text-base text-gray-700 leading-relaxed">
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
