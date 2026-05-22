import type { Metadata } from "next";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Integrate — Figaro Protocol",
    description:
        "@figaro/core: ABIs, event parsers, deterministic state reconstruction, commitment builders, action queue, schema encoders. Four subpath exports. The chain is the primary record; no separate gateway, indexer, or subgraph required.",
};

export default function Integrate() {
    return (
        <>
            <MarketingHero
                title="SDK and composition surface."
                lead={
                    <>
                        <code>@figaro/core</code> ships ABIs, event parsers, deterministic state reconstruction, commitment builders, an action queue, and schema encoders. The chain is the primary record &mdash; no separate Figaro gateway, indexer, or subgraph required.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    Kernel context lives at <Link href="/protocol" className="underline">Protocol</Link>; contract catalogue at <Link href="/spec" className="underline">/spec</Link>; schema architecture at <Link href="/schemas" className="underline">/schemas</Link>; composition tools at <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingHero>

            <MarketingSection title="Agents participate as bonded counterparties.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    Nothing in the kernel distinguishes a human signer from an agent &mdash; an EIP-712 signature is an EIP-712 signature. <code>@figaro/core/agent</code> ships <code>FigaroContext</code>, <code>proposeActions</code>, and <code>ActionQueue</code>: an agent receives kernel state, returns the set of valid actions, and submits via a wallet client. The queue runs in two modes &mdash; human-in-the-loop approval, or fully autonomous submission &mdash; without changes to the underlying call sites.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    What this enables: agents that hold roles in a process (a courier-bot bonded against cumulative value, an offset-burning operator settling under the same atomic-resolution rule, an audit agent reading reconstructed state and posting attestations). Bonding makes the agent legible to its counterparty &mdash; cooperation is dominant for the agent on the same arithmetic that makes it dominant for a human (Paper A, Theorem 4.3).
                </p>
                <p className="text-sm text-ink-muted">
                    Subpath: <code>@figaro/core/agent</code>. Full subpath table below.
                </p>
            </MarketingSection>

            <MarketingSection title="Read, reconstruct, propose.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    <code>@figaro/core</code> is a TypeScript SDK with a single runtime dependency (<code>viem</code>). ESM, four subpath exports. Used from React frontends, server-side indexers, and headless agents.
                </p>
                <ul className="space-y-4">
                    <LabelledListRow label="@figaro/core" labelWidth="narrow" uppercase>
                        <strong>ABIs, event parsers, state reconstruction.</strong> <code>reconstruct()</code> one-shot state; <code>ProcessGraph</code> class for incremental replay; <code>fetchCoreEvents</code> bulk fetch. <code>buildCommitment</code>, <code>buildCommitmentSafe</code>, <code>buildDomain</code> for constructing commitments off-chain. <code>calculateBonds</code>, <code>calculateSettlement</code>, <code>validateBonds</code> for bond arithmetic.
                    </LabelledListRow>
                    <LabelledListRow label="/agent" labelWidth="narrow" uppercase>
                        <strong>Action proposer + dual-mode queue.</strong> <code>FigaroContext</code>, <code>proposeActions</code>, <code>ActionQueue</code>. Human-in-the-loop approval or fully autonomous submission via <code>WalletClient</code>. See the Agent SDK section above.
                    </LabelledListRow>
                    <LabelledListRow label="/extensions" labelWidth="narrow" uppercase>
                        <strong>Dutch auction, attestation/GHG encoding, geo/handoff utilities, did:web resolution.</strong> Everything at the protocol tier that isn&apos;t kernel-critical but is commonly needed.
                    </LabelledListRow>
                    <LabelledListRow label="/schemas" labelWidth="narrow" uppercase>
                        <strong>Meta-schema validator + per-schema content encoders.</strong> Canonical spec format that the SP1 prover and Solidity validators mirror. Layer-A of the three-layer validation pattern (see <Link href="/schemas" className="underline">/schemas</Link>).
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Seven event types is the whole event surface.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every kernel state change emits an event. Replayed into a state machine, they produce the complete ledger position the contract itself holds.
                </p>
                <ul className="space-y-3">
                    <LabelledListRow label="OrderCommitted" labelWidth="wide">
                        The canonical commitment payload: processId, orderHash, buyer, seller, currency, payment, cumulativeValue, agreementHash, salt, deadline.
                    </LabelledListRow>
                    <LabelledListRow label="OrderSeller" labelWidth="wide">
                        Companion event indexing seller address (EVM caps indexed event args at three).
                    </LabelledListRow>
                    <LabelledListRow label="OrderCurrency" labelWidth="wide">
                        Companion event indexing currency address.
                    </LabelledListRow>
                    <LabelledListRow label="OrderResolved" labelWidth="wide">
                        Per-order at resolution.
                    </LabelledListRow>
                    <LabelledListRow label="ProcessResolved" labelWidth="wide">
                        Per-process at resolution with order count.
                    </LabelledListRow>
                    <LabelledListRow label="Attestation" labelWidth="wide">
                        Schema-typed attestation from the coordinator: orderHash, processId, attester, schemaId, stage, contentRef (= keccak256(content)).
                    </LabelledListRow>
                    <LabelledListRow label="MinterRegistered" labelWidth="wide">
                        FIG token minter registry. Not relevant to settlement; relevant if you&apos;re indexing the token.
                    </LabelledListRow>
                </ul>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    Any client that can read the chain reconstructs any state.
                </p>
            </MarketingSection>

            <MarketingSection title="Install, fetch, reconstruct.">
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-2 mb-3 overflow-x-auto whitespace-pre"
                >
                    <code>npm install @figaro/core viem</code>
                </pre>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { fetchCoreEvents, reconstruct } from "@figaro/core";
import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http(process.env.RPC_URL),
});

const events = await fetchCoreEvents(client, {
  core: CORE_ADDRESS,
  fromBlock: DEPLOY_BLOCK,
  toBlock: "latest",
});

const state = reconstruct(events);
// state.processes, state.orderStatus, state.orderProcessId
// — the same state the contract itself holds.`}</code>
                </pre>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    The reconstruction is deterministic: the same events fetched against the same chain state produce the same output. No &ldquo;eventually consistent&rdquo; behavior, no reorg surprises beyond the chain&apos;s own finality assumptions.
                </p>
            </MarketingSection>

            <MarketingSection title="The kernel is narrow. The ecosystem composes around it.">
                <div className="border-l-2 border-default pl-6 mb-8">
                    <p className="text-sm text-ink-body leading-relaxed">
                        <strong>Implementation status.</strong> Currently wired: Kleros evidence export, XMTP messaging, IPFS storage, GHG disclosure attestations. Everything else below is a <strong>compositional surface</strong> &mdash; an architectural slot integrators can build against, with named vendors as illustrative examples rather than current integrations.
                    </p>
                </div>

                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Figaro&apos;s useful extensions are predominantly external: the kernel does not include a dispute forum, a carbon-offset market, a prediction market, an insurance pool, a lending facility, a tax-reporting service, an identity provider, a storage layer, or a messaging fabric. An assembly names which external surfaces it composes with. A concrete walkthrough first, then the surface area.
                </p>

                <div className="border-l-2 border-default pl-6 mb-8">
                    <h3 className="text-base font-semibold text-ink-heading mb-3">
                        Architectural example &mdash; carbon offset before settlement
                    </h3>
                    <p className="text-sm text-ink-body leading-relaxed mb-4">
                        A delivery process runs through its normal lifecycle. Before the buyer calls <code>resolveProcess</code>, the GHG schema has fired an attestation declaring <em>X</em> grams CO<sub>2</sub>e emitted. The buyer commits a sub-order against an offset operator registered with the assembly, adding the offset purchase to the same process before closing. (The offset operator is whichever counterparty the assembly admits; integrators could register Klima DAO, Toucan, Moss, or any bonded operator.)
                    </p>
                    <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                        <li><strong>UI surfaces the option.</strong> A live quote from a bonded offset operator registered against the assembly.</li>
                        <li><strong>Buyer commits a sub-order.</strong> Same <code>processId</code>, non-zero <code>cumulativeValue</code>, offset operator as seller. Buyer bonds <code>2&times;Y</code>; operator bonds 2&times; cumulative value (Paper A, Theorem 4.3).</li>
                        <li><strong>Wallet handles any token swap.</strong> Multi-token bookkeeping is resolved before the commit; the kernel sees a single-currency sub-order.</li>
                        <li><strong>Operator delivers.</strong> Burns the offset and posts the burn receipt as an attestation against the sub-order.</li>
                        <li><strong>Buyer calls <code>resolveProcess</code> once.</strong> Main order and offset sub-order settle atomically. Offset receipt joins the evidence bundle.</li>
                    </ol>
                    <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                        Result: one settled process whose evidence bundle contains both the commerce record and an offset record verifiable against the burn receipt&apos;s on-chain attestation.
                    </p>
                </div>

                <h3 className="text-heading-h3 text-ink-heading mb-4">Compositional surfaces.</h3>
                <ul className="space-y-4">
                    <LabelledListRow label="Forums" uppercase>
                        <strong>Kleros, SIAC, ICC, courts.</strong> Parties&apos; agreement designates the forum; Figaro exports its evidence bundle there. Kernel does not adjudicate. Kleros wired today; other forums are off-chain referents named in the agreement. See <a href="/papers/figaro-legal.pdf" className="underline">Paper E (legal)</a>.
                    </LabelledListRow>
                    <LabelledListRow label="Offsets" uppercase>
                        <strong>Klima DAO, Toucan, Moss.</strong> Architectural slot for an offset operator that bonds as a seller. Walkthrough above.
                    </LabelledListRow>
                    <LabelledListRow label="Prediction" uppercase>
                        <strong>Polymarket, Augur.</strong> Compositional target for outcome-resolution oracles that feed attestations gating a process.
                    </LabelledListRow>
                    <LabelledListRow label="Insurance" uppercase>
                        <strong>Nexus Mutual, Sherlock.</strong> Compositional target for counterparty-default or smart-contract-failure cover wrapping a process against Figaro&apos;s evidence bundle.
                    </LabelledListRow>
                    <LabelledListRow label="Lending" uppercase>
                        <strong>Aave, Compound, Morpho.</strong> Compositional target for bond-financing when a seller lacks collateral upfront. Lender is a separate counterparty in a separate process.
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

                <p className="mt-8 text-sm text-ink-body leading-relaxed">
                    <strong>How composition stays safe.</strong> An external mechanism that could override resolution, claw back a bond, or revoke a counterparty mid-process would import an escape hatch the kernel was designed to deny. The coordinator pattern gives three sufficient conditions under which composition preserves the bonding equilibrium: the external reads kernel state and emits its own evidence, but never writes to kernel state, never reverses a resolution, and never controls a bond. Integrators bringing a new external into an assembly should verify the composition against the same conditions. Property-side treatment with Theorem 4.7 citation: <Link href="/composability" className="underline">Composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to look" bottomPad="extra">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro-Prototype2</a>. SDK lives at <code>sdk/</code>.</li>
                    <li><strong>SDK README:</strong> <code>sdk/README.md</code> in the repo. Covers every subpath export and the test-harness conventions.</li>
                    <li><strong>ABIs:</strong> <code>CORE_ABI</code>, <code>ATTESTATION_COORDINATOR_ABI</code>, <code>DUTCH_AUCTION_ABI</code>, <code>SCHEMA_REGISTRY_ABI</code>, <code>ERC20_ABI</code>, <code>OPERATOR_REGISTRY_ABI</code>, <code>FIG_TOKEN_ABI</code>, <code>RPGF_MINTER_ABI</code>. All exported from <code>@figaro/core</code>; canonical contract surface at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Tests as documentation:</strong> <code>sdk/tests/</code> includes round-trip tests of every exported primitive. If the README is ambiguous, read the tests.</li>
                </ul>
                <p className="mt-8 text-sm text-ink-muted leading-relaxed">
                    Related:&nbsp;
                    <Link href="/protocol" className="underline">Protocol</Link>{" "}(kernel invariants);&nbsp;
                    <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>{" "}(academic frame);&nbsp;
                    <Link href="/builders" className="underline">Builders</Link>{" "}(composition tools);&nbsp;
                    <Link href="/local-commerce" className="underline">Local Commerce</Link>{" "}(reference assembly);&nbsp;
                    <Link href="/discover" className="underline">Discover</Link>{" "}(operator catalogue);&nbsp;
                    <Link href="/schemas" className="underline">Schemas</Link>{" "}(attestation content for indexers).
                </p>
            </MarketingSection>
        </>
    );
}
