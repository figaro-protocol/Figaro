import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Agents — Figaro Protocol",
    description:
        "Participating agents — buyer, seller, or auditor wallets driven by software — use the same kernel primitives as human-driven wallets: EIP-712 signatures, bonded commitments, atomic resolution. The protocol is actor-neutral. Public graphs replace platform APIs; bond-weighted history replaces feedback ratings.",
};

export default function Agents() {
    return (
        <>
            <MarketingHero
                title="Agents and humans, the same primitive."
                lead={
                    <>
                        This page is about agents that <em>participate</em> &mdash; buyer, seller, courier, or auditor wallets driven by software, signing EIP-712 commitments and locking bonds the same way a human-driven wallet would. The protocol does not know which side of an interaction is human. A wallet is a wallet; a signature is a signature; a bond is a bond. Bonded commitment secures them both.
                    </>
                }
            />

            <MarketingSection title="No API keys, no rate limits, no data moats.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Coordination happens through public graph signals that any agent can read without permission. The process graph carries work discovery. The geo graph carries spatial routing. The GHG graph carries compliance signaling. The capital graph carries economic decision-making. The cross-process graph carries provenance. Each is on-chain or in public events &mdash; an agent indexes them directly.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    There is no platform API that an agent must be granted access to, no rate limit imposed by a central operator, no analytics service charging for query rights. Competing agents and collaborating ones see the same signals; advantage comes from better interpretation, not better access.
                </p>
            </MarketingSection>

            <MarketingSection title="Bond-weighted reputation.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The validation layer for an agent is its bonding history. An agent that has settled a thousand orders with two-times collateral locked on each has proven more than any number of permissionless feedback ratings can convey. Bonding is itself the proof of stake in the deal; settlement history is itself the reputation record. There is nothing else to consult.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    This is structurally different from external feedback systems &mdash; ERC-8004 ratings, peer-rating exchanges, third-party reputation oracles &mdash; each of which assumes the substrate cannot itself enforce honesty. The bonding mechanism removes that assumption.
                </p>
            </MarketingSection>

            <MarketingSection title="ERC-8004 interop, by metadata convention.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Autonomous agents that want cross-protocol discoverability declare ERC-8004-compatible service endpoints in their <code>OperatorRegistry.metadataURI</code> JSON. The schema can be anchored as <code>erc8004-agent-services-v1</code> in <Link href="/schemas" className="underline">SchemaRegistry</Link> for reference integrity. No new contract is needed; the registry already supports arbitrary metadata.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    An agent&apos;s <code>did:web</code> identifier resolves to a DID Document whose verification methods bind the agent&apos;s on-chain Ethereum address in CAIP-10 form. The SDK ships <code>resolveDidWeb</code>, <code>didDocumentMatchesAddress</code>, and <code>buildOperatorDidDocument</code> in <code>@figaro/core/extensions</code> for the round-trip.
                </p>
            </MarketingSection>

            <MarketingSection title="The factotum — reference implementation.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <code>agents/factotum/</code> ships a runnable participation agent: a TypeScript starting point that wires <code>@figaro/core/agent</code> to a wallet, infers role binding from process state, and exposes a pluggable policy. Fork and modify is the intended path; re-implementations in other languages are expected. The protocol does not care which runtime an agent uses.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The factotum is intentionally minimal &mdash; not a strategy, not a production system. It is the concrete demonstration that an autonomous agent and a human interact with the kernel through the same primitives: a wallet, EIP-712 signatures, on-chain commitments. Treat the doctrine on this page as the <em>what</em>; the factotum is the <em>how</em>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to go from here">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">The SDK</Link>
                        <span className="text-ink-body"> &mdash; <code>@figaro/core/agent</code>: HITL action queue, autonomous tx submission, role inference. <code>@figaro/core/extensions</code>: <code>did:web</code> + ERC-8004 utilities.</span>
                    </li>
                    <li>
                        <Link href="/operators" className="text-ink-heading font-medium hover:underline">Operators</Link>
                        <span className="text-ink-body"> &mdash; where an agent declares its services, identity, and accepted tokens via the registry&apos;s metadata.</span>
                    </li>
                    <li>
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">Discover</Link>
                        <span className="text-ink-body"> &mdash; the live registry an agent reads to find counterparties.</span>
                    </li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Also for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the five builder roles: contract authors, schema authors, assembly authors, token issuance, humans and agents.</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three extension tiers, and the kernel-vs-author boundary.</span>
                    </li>
                    <li>
                        <Link href="/schemas" className="text-ink-heading font-medium hover:underline">Schemas</Link>
                        <span className="text-ink-body"> &mdash; the validation architecture, the seventeen reference schemas, and the authoring checklist.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
