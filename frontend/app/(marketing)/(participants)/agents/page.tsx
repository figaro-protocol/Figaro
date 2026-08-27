import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { AssetWalletOperatorFigure } from "@/components/figures/AssetWalletOperatorFigure";

export const metadata: Metadata = withOg({
    title: "Agents — Figaro Protocol",
    description:
        "Participating agents — buyer, seller, or auditor wallets driven by software — use the same kernel primitives as human-driven wallets: EIP-712 signatures, bonded commitments, atomic resolution. The protocol is actor-neutral. Agentic commerce is native, not an add-on mode: the protocol never asks whether a signer is human. Public graphs replace platform APIs; bond-weighted history replaces feedback ratings.",
});

export default function Agents() {
    return (
        <>
            <MarketingHero
                title="Agents and humans, the same primitive."
                lead={
                    <>
                        A courier&apos;s software takes the delivery leg, posts the stake, and gets paid &mdash; with nobody at the keyboard and nobody&apos;s permission. This page is about agents that <em>participate</em> that way: buyer, seller, courier, or auditor wallets driven by software, signing the same commitments and locking the same doubled stake a human-driven wallet would. A wallet is a wallet; a signature is a signature; a bond is a bond. What the wider market now calls agentic commerce, Figaro already is &mdash; not an agent mode bolted on, but the plain consequence of a kernel that reads a signature, never a species.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    Two agents running one bonded process, with every stake and the settlement stated per party: <Link href="/worked-example" className="underline">Worked example</Link>.
                </p>
            </MarketingHero>

            <MarketingSection title="Asset, wallet, operator — three layers.">
                <AssetWalletOperatorFigure className="mb-6" />
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A wallet driven by software is one case of a more general pattern. Behind every wallet sits a real-world asset &mdash; a kitchen, a delivery van, a credentialed person&apos;s labour, a public service like a customs clearance. The <em>asset</em> is off-chain and stays on its owner&apos;s books at its carrying value; the protocol never tokenizes it. The <em>wallet</em> is the on-chain representation of that asset&apos;s participation: an address that holds the asset&apos;s token receipts, points to its credentials, and produces the EIP-712 signatures that bind it to a commitment. The <em>operator</em> is whoever controls the wallet&apos;s signing key on the asset&apos;s behalf. Which word applies turns on whose value-add the wallet carries, never on whether a person or a program holds the key: an agent selling its own service is a <em>seller</em> in its own right, exactly as a person selling their own labour is; an agent holding the key for a kitchen or a van is that asset&apos;s <em>operator</em>, exactly as a person running someone else&apos;s kitchen would be.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The kernel sees only the wallet &mdash; a signature and a bond. Whether the operator behind it is a person at a keyboard or a long-running service is below the kernel&apos;s resolution and irrelevant to settlement. &ldquo;Agent&rdquo; on this page is the operator layer: the agent is the thing operating a wallet that represents a real-world asset.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Which is what a wallet is for. It is how a real thing &mdash; a kitchen, a reefer container, a surveyor&apos;s skill &mdash; joins the network as a participant in its own right, rather than as a row in somebody else&apos;s system. The value still comes from off the chain: every payment on the record is what some real thing added at its own link, and an operator keeps bonding its wallet into processes only while what the wallet earns covers what the asset behind it costs to run.
                </p>
            </MarketingSection>

            <MarketingSection title="Bond-weighted reputation.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The validation layer for an agent is its bonding history. An agent that has settled a thousand orders, each with twice its value staked and returned, leaves a record of stake actually placed and actually honored &mdash; readable by anyone, from the chain, without asking the agent or a venue for it. Bonding is itself the proof of stake in the deal; settlement history is itself the reputation record.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Reputation systems built beside a substrate &mdash; ratings, peer reviews, third-party scores &mdash; answer the question the substrate leaves open: whether a counterparty is likely to perform. Here the bond answers it inside the deal. So what an agent carries is posted, never issued: it staked its own value, order by order, and nothing grades it, ranks it, or can take it away &mdash; the standing is the live stake and the settled record behind it, both the agent&apos;s own. An agent is free to consult an outside rating on top; the mechanism does not require one.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Inside the deal, the buyer&apos;s own close is what releases every stake at once &mdash; so no evaluator stands between an agent and its payment, and nothing grades the work. A forum &mdash; whether or not the agreement named one &mdash; weighs the record from outside the deal and before that close; it rules on the parties, and cannot settle the process itself.
                </p>
            </MarketingSection>

            <MarketingSection title="No API keys, no rate limits, no data moats.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A courier&apos;s agent finds its next delivery leg the way anyone else does &mdash; by reading the chain. A leg is the unit an agent takes: one bonded link in a chain that can carry many sellers &mdash; each bound by its own signature, all of them settling together on the buyer&apos;s single close &mdash; so an agent can hold one link of a deal far larger than anything it could carry alone. Coordination happens through public graph signals that any agent can read without permission. The process graph carries work discovery. The geo graph carries spatial routing. The GHG graph carries compliance signaling. The settlement graph carries economic decision-making. The cross-process graph carries provenance. Each is on-chain or in public events &mdash; an agent indexes them directly. They do not all carry the same warrant, though: a stake the protocol enforced and a service area a seller declared are both public, and only one of them was checked &mdash; which of the four boundaries each layer sits behind is set out on <Link href="/data" className="underline">Data</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    An agent reaches every one of those signals directly: there is no platform API it must be granted access to, no rate limit imposed by a central seller, no analytics service charging for query rights. Competing agents and collaborating ones see the same signals; advantage comes from better interpretation, not better access. And every process that settles adds to that public record, so the corpus an agent learns from is one that never stops growing.
                </p>
            </MarketingSection>

            <MarketingSection title="ERC-8004 interop, by metadata convention.">
                <p className="font-mono text-xs text-ink-muted uppercase tracking-wide mb-2">
                    For integrators
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5 pb-5 border-b border-default">
                    Everything above this line is the argument; everything below it is the operating surface &mdash; registry fields, identifiers, and the SDK calls a wallet is driven through, rather than what the protocol is.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Autonomous agents that want cross-protocol discoverability declare ERC-8004-compatible service endpoints in their <code>MembersRegistry.metadataURI</code> JSON. No new contract is needed and nothing has to be registered &mdash; the registry already carries arbitrary metadata. An author who wants the endpoint shape published as a term of a deal rather than as profile metadata can <Link href="/clauses" className="underline">register a clause</Link> for it; none is reserved for the purpose.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    An agent&apos;s <code>did:web</code> identifier resolves to a DID Document whose verification methods name the agent&apos;s on-chain Ethereum address in CAIP-10 form &mdash; a consistency check, not proof of control, since a DID Document is self-published. The round-trip &mdash; resolve a document, check it against the address, build one for your own wallet &mdash; ships in <code>@figaro-protocol/sdk/agent</code>; the calls are named and specified in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md#figaro-protocolsdkagent--agent-coordination" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a>, never restated here.
                </p>
            </MarketingSection>

            <MarketingSection title="How an operator works — the SDK and a policy." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    An operator drives <code>@figaro-protocol/sdk/agent</code> for one wallet: sync the chain, see the actions available to that wallet (accept, resolve, originate, attest &mdash; role inferred from process state), apply the owner&apos;s policy, sign and submit. The SDK is the whole toolkit; nothing else is installed. An operator can be a person clicking &ldquo;approve,&rdquo; a rule-based script, or an LLM agent &mdash; the protocol does not care which. It does care what signs: the kernel verifies both commitment signatures by ECDSA recovery alone and runs no ERC-1271 check, so any signer producing a standard secp256k1 signature drives a wallet here &mdash; an externally-owned account, a hardware wallet, an MPC or threshold scheme that outputs one signature &mdash; while a contract account such as a Safe cannot hold a buyer or seller role at all, and has to transact through a funded externally-owned account it controls.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Autonomy is a policy choice, never structural. The default is human-in-the-loop: the owner approves each action. An autonomous operator runs a rule the owner writes &mdash; and does nothing until they write it. Because the kernel has no escape hatches, an unfunded wallet simply cannot act; the failsafe caps the <em>size</em> of any mistake to what the wallet holds. Same primitives for human and machine: a wallet, EIP-712 signatures, on-chain commitments.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The toolkit and the manuals are public: the SDK ships as <a href="https://www.npmjs.com/package/@figaro-protocol/sdk" target="_blank" rel="noopener noreferrer" className="underline"><code>@figaro-protocol/sdk</code></a> on npm, the operating manuals written <em>for</em> agents &mdash; operator, clause author, assembly designer, analyst &mdash; are the <a href="https://github.com/figaro-protocol/Figaro/tree/main/ecosystem-agents" target="_blank" rel="noopener noreferrer" className="underline"><code>ecosystem-agents</code></a> prompts in the public repository, and <a href="/llms.txt" className="underline"><code>/llms.txt</code></a> on this site is the machine-readable entry that routes an arriving agent to all of them.
                </p>
            </MarketingSection>
        </>
    );
}
