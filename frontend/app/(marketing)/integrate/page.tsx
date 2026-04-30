import Link from "next/link";

export default function Integrate() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Integrate
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    SDK and composition surface.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    <code>@figaro/core</code> ships a deterministic state reconstruction primitive &mdash; feed it events, get back the ledger. The kernel composes with external protocols (forums, offset markets, insurance, lending, identity, storage, messaging) through a documented coordinator pattern. Integrators build auditor dashboards, public-graph tools, agent clients, and back-office tooling against any deployment without running dedicated infrastructure.
                </p>
            </section>

            {/* Agent SDK — promoted because protocol participation is wallet-symmetric */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Agent SDK
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Agents participate as bonded counterparties.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    Nothing in the kernel distinguishes a human signer from an agent &mdash; an EIP-712 signature is an EIP-712 signature. <code>@figaro/core/agent</code> ships <code>FigaroContext</code>, <code>proposeActions</code>, and <code>ActionQueue</code>: an agent receives kernel state, returns the set of valid actions, and submits via a wallet client. The queue runs in two modes &mdash; human-in-the-loop approval, or fully autonomous submission &mdash; without changes to the underlying call sites.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    What this enables: agents that hold roles in a process tree (a courier-bot bonded against cumulative value, an offset-burning operator settling under the same atomic-resolution rule, an audit agent reading reconstruct&apos;d state and posting attestations). Bonding makes the agent legible to its counterparty &mdash; cooperation is dominant for the agent on the same arithmetic that makes it dominant for a human.
                </p>
                <p className="text-sm text-gray-500">
                    Subpath: <code>@figaro/core/agent</code>. See subpath table below for the full SDK surface.
                </p>
            </section>

            {/* What the SDK gives you */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Subpaths
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Read, reconstruct, propose.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    <code>@figaro/core</code> is a TypeScript SDK with a single runtime dependency (<code>viem</code>). ESM, four subpath exports. Used from React frontends, server-side indexers, and headless agents.
                </p>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">@figaro/core</span>
                        <span><strong>ABIs, event parsers, state reconstruction.</strong> <code>reconstruct()</code> one-shot state; <code>ProcessGraph</code> class for incremental replay; <code>fetchCoreEvents</code> bulk fetch. <code>buildCommitment</code>, <code>buildCommitmentSafe</code>, <code>buildDomain</code> for constructing commitments off-chain. <code>calculateBonds</code>, <code>calculateSettlement</code>, <code>validateBonds</code> for bond arithmetic.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">/agent</span>
                        <span><strong>Action proposer + dual-mode queue.</strong> <code>FigaroContext</code>, <code>proposeActions</code>, <code>ActionQueue</code>. Human-in-the-loop approval or fully autonomous submission via <code>WalletClient</code>. Nothing in the protocol distinguishes a human signer from an agent.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">/extensions</span>
                        <span><strong>Dutch auction, attestation/GHG encoding, geo/handoff utilities, did:web resolution.</strong> Everything at the protocol tier that isn&apos;t kernel-critical but is commonly needed.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">/schemas</span>
                        <span><strong>Meta-schema validator + per-schema content encoders.</strong> Canonical spec format that the SP1 prover and Solidity validators mirror. Layer-A of the three-layer validation pattern (see <Link href="/schemas" className="underline hover:text-black">/schemas</Link>).</span>
                    </li>
                </ul>
            </section>

            {/* Event types */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The event model
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Seven event types is the whole state machine.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    Every kernel state change emits an event. Replayed into a state machine, they produce the complete ledger position — the same position the contract itself holds.
                </p>
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">OrderCommitted</span><span>The canonical commitment payload: processId, orderHash, buyer, seller, currency, payment, cumulativeValue, agreementHash, salt, deadline.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">OrderSeller</span><span>Companion event indexing seller address (EVM caps indexed event args at three).</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">OrderCurrency</span><span>Companion event indexing currency address.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">OrderResolved</span><span>Per-order at resolution.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">ProcessResolved</span><span>Per-process at resolution with order count.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">Attestation</span><span>Schema-typed attestation from the coordinator: orderHash, processId, attester, schemaId, stage, contentRef (= keccak256(content)).</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-44 shrink-0 truncate">MinterRegistered</span><span>FIG token minter registry. Not relevant to settlement; relevant if you&apos;re indexing the token.</span></li>
                </ul>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    No subgraph dependency. No centralized indexer. Any client that can read the chain can reconstruct any state.
                </p>
            </section>

            {/* Quick start */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Quick start
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Install, fetch, reconstruct.
                </h2>
                <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-1">npm install @figaro/core viem</p>
                    </div>
                    <pre className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-3 overflow-x-auto whitespace-pre">{`import { fetchCoreEvents, reconstruct } from "@figaro/core";
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
// — identical to what the contract itself holds.`}</pre>
                </div>
                <p className="mt-6 text-sm text-gray-700 leading-relaxed">
                    The reconstruction is deterministic. Two integrators running the same fetch against the same chain state produce byte-identical output. No &ldquo;eventually consistent&rdquo; behavior, no reorg surprises beyond the chain&apos;s own finality assumptions.
                </p>

                <p className="mt-4 text-sm text-gray-600 leading-relaxed">
                    Note: the chain itself is the primary record. There is no separate Figaro API, no gateway, no subgraph required.
                </p>
            </section>

            {/* Who builds with this */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Integration patterns
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Four categories.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Auditor dashboards</div>
                        <p>Audit firms building tools to verify Figaro-settled processes for clients. Use <code>reconstruct()</code> + attestation event filters. See <Link href="/compliance" className="underline hover:text-black">/compliance</Link> for the audit framework.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Public-graph tools</div>
                        <p>Indexers surfacing settlement velocity, counterparty reputation, assembly uptime. Aggregate events across processes; expose read-only queries.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Autonomous agents</div>
                        <p><code>/agent</code> subpath ships <code>proposeActions</code> (returns the set of valid actions given a state and address) and <code>ActionQueue</code> (dual-mode: HITL approve/reject, or autonomous submit). Build agents that participate as bonded counterparties on the same terms as humans.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Back-office tooling</div>
                        <p>Accounting, tax-reporting, regulatory-filing tools that translate on-chain Figaro activity into jurisdictional formats. See <a href="/papers/figaro-accounting.pdf" className="underline hover:text-black">Paper G (accounting)</a> for the underlying ledger model.</p>
                    </div>
                </div>
            </section>

            {/* External composition — concrete walkthrough first */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    External composition
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    The kernel is narrow. The ecosystem composes around it.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    Figaro&apos;s useful extensions are predominantly external: the kernel does not include a dispute forum, a carbon-offset market, a prediction market, an insurance pool, a lending facility, a tax-reporting service, an identity provider, a storage layer, or a messaging fabric. An assembly names which external surfaces it composes with. A concrete example first, then the surface area.
                </p>

                <div className="border border-gray-200 rounded-lg p-6 mb-8">
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Walkthrough &mdash; carbon offset before settlement</div>
                    <p className="text-sm text-gray-700 leading-relaxed mb-4">
                        A delivery process runs through its normal lifecycle. Before the buyer calls <code>resolveProcess</code>, the GHG schema has fired an attestation declaring <em>X</em> grams CO<sub>2</sub>e emitted. The buyer can then commit a sub-order against an offset operator registered with the assembly, adding the offset purchase to the same process before closing.
                    </p>
                    <ol className="space-y-3 text-sm text-gray-700 leading-relaxed list-decimal pl-5">
                        <li><strong>UI surfaces the option.</strong> A live quote from a bonded offset operator (Klima DAO, Toucan, Moss) registered against the assembly.</li>
                        <li><strong>Buyer commits a sub-order.</strong> Same <code>processId</code>, non-zero <code>cumulativeValue</code>, offset operator as seller. Buyer bonds <code>2&times;Y</code>; operator bonds on their side.</li>
                        <li><strong>Wallet handles any token swap.</strong> Multi-token bookkeeping is resolved before the commit; the kernel sees a single-currency sub-order.</li>
                        <li><strong>Operator delivers.</strong> Burns the offset, posts the burn receipt as an attestation against the sub-order.</li>
                        <li><strong>Buyer calls <code>resolveProcess</code> once.</strong> Main order and offset sub-order settle atomically. Offset receipt joins the evidence bundle.</li>
                    </ol>
                    <p className="mt-4 text-sm text-gray-500 leading-relaxed">
                        Result: one settled process whose evidence bundle contains both the commerce record and a verifiable offset. The offset is not a claim to a registry &mdash; it is a schema-validated on-chain attestation from a bonded operator.
                    </p>
                </div>

                <h3 className="text-xl font-bold text-black mb-4">Nine external surfaces.</h3>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Forums</span>
                        <span><strong>Kleros, SIAC, ICC, courts.</strong> Parties&apos; agreement designates the forum; Figaro exports its evidence bundle there. Kernel does not adjudicate. See <a href="/papers/figaro-legal.pdf" className="underline hover:text-black">Paper E (legal)</a>.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Offsets</span>
                        <span><strong>Klima DAO, Toucan, Moss.</strong> Offset operator bonds as a seller; receipt joins the evidence bundle; tree resolves atomically. Walkthrough above.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Prediction</span>
                        <span><strong>Polymarket, Augur.</strong> Outcome-resolution oracles feed attestations that gate a process.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Insurance</span>
                        <span><strong>Nexus Mutual, Sherlock.</strong> Counterparty-default or smart-contract-failure cover wraps a process against Figaro&apos;s evidence bundle.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Lending</span>
                        <span><strong>Aave, Compound, Morpho.</strong> Bond-financing when a seller lacks collateral upfront. Lender is a separate counterparty in a separate process.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Tax / reporting</span>
                        <span><strong>TaxBit, Koinly, Cryptio.</strong> Jurisdictional reports derive from chain state. No reconciliation &mdash; the chain is the primary record.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Identity</span>
                        <span><strong>DID:web, Polygon ID, Worldcoin.</strong> Optional real-world identity attachment when the forum requires it.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Storage</span>
                        <span><strong>IPFS, Arweave.</strong> Off-chain agreement documents, large evidence artifacts. <code>agreementHash</code> anchors them on chain.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Messaging</span>
                        <span><strong>XMTP.</strong> Per-order encrypted handoff channels. Wired via <code>lib/handoff/</code>.</span>
                    </li>
                </ul>

                <p className="mt-8 text-sm text-gray-500 leading-relaxed">
                    <strong>How composition stays safe.</strong> An external mechanism that could override resolution, claw back a bond, or revoke a counterparty mid-process would import an escape hatch the kernel was designed to deny. The coordinator pattern gives four sufficient conditions under which composition preserves the bonding equilibrium: the external reads kernel state and emits its own evidence, but never writes to kernel state, never reverses a resolution, and never controls a bond. Integrators bringing a new external into an assembly should verify the composition against the same conditions.
                </p>

                <p className="mt-4 text-xs text-gray-500 leading-relaxed">
                    Implementation status: Kleros evidence export, XMTP messaging, and GHG disclosure attestations are wired. Klima offset integration is documented as an architectural plan. The rest are compositional surfaces integrators can build against, not shipped-today features.
                </p>
            </section>

            {/* Where to look */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Where to look
                </p>
                <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <p><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">github.com/figaro-protocol/Figaro-Prototype2</a>. SDK lives at <code>sdk/</code>.</p>
                    <p><strong>SDK README:</strong> <code>sdk/README.md</code> in the repo. Covers every subpath export and the test-harness conventions.</p>
                    <p><strong>ABIs:</strong> <code>CORE_ABI</code>, <code>ATTESTATION_COORDINATOR_ABI</code>, <code>DUTCH_AUCTION_ABI</code>, <code>SCHEMA_REGISTRY_ABI</code>, <code>ERC20_ABI</code>, <code>OPERATOR_REGISTRY_ABI</code>, <code>FIG_TOKEN_ABI</code>, <code>STAGED_MERKLE_AIRDROP_ABI</code>. All exported from <code>@figaro/core</code>.</p>
                    <p><strong>Tests as documentation:</strong> <code>sdk/tests/</code> includes round-trip tests of every exported primitive. If the README is ambiguous, read the tests.</p>
                </div>
                <p className="mt-8 text-sm text-gray-500">
                    Related:&nbsp;
                    <Link href="/compliance" className="underline hover:text-black">compliance</Link>
                    &nbsp;(audit framework consuming reconstructed state);&nbsp;
                    <Link href="/schemas" className="underline hover:text-black">schemas</Link>
                    &nbsp;(attestation content for indexers);&nbsp;
                    <Link href="/spec" className="underline hover:text-black">spec</Link>
                    &nbsp;(protocol extension discipline).
                </p>
            </section>

        </>
    );
}
