import type { Metadata } from "next";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Integrate — Figaro Protocol",
    description:
        "@figaro/sdk: ABIs, event parsers, deterministic state reconstruction, commitment builders, action queue, clause encoders. Four subpath exports. The chain is the primary record; no separate gateway, indexer, or subgraph required.",
};

export default function Integrate() {
    return (
        <>
            <MarketingHero
                title="SDK and composition surface."
                lead={
                    <>
                        <code>@figaro/sdk</code> ships ABIs, event parsers, deterministic state reconstruction, commitment builders, an action queue, and clause encoders. The chain is the primary record &mdash; no separate Figaro gateway, indexer, or subgraph required.
                    </>
                }
            >
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mt-4">
                    Kernel context lives at <Link href="/protocol" className="underline">Protocol</Link>; contract catalogue at <Link href="/spec" className="underline">/spec</Link>; clause architecture at <Link href="/clauses" className="underline">/clauses</Link>; composition tools at <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingHero>

            <MarketingSection title="Agents participate as bonded counterparties.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    Nothing in the kernel distinguishes a human signer from an agent &mdash; an EIP-712 signature is an EIP-712 signature. <code>@figaro/sdk/agent</code> ships <code>FigaroContext</code>, <code>proposeActions</code>, and <code>ActionQueue</code>: an agent receives kernel state, returns the set of valid actions, and submits via a wallet client. The queue runs in two modes &mdash; human-in-the-loop approval, or fully autonomous submission &mdash; without changes to the underlying call sites.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    What this enables: agents that hold roles in a process (a courier-bot bonded against cumulative value, an offset-burning seller settling under the same atomic-resolution rule, an audit agent reading reconstructed state and posting attestations). Bonding makes the agent legible to its counterparty &mdash; cooperation weakly dominates for the agent on exactly the arithmetic that makes it weakly dominate for a human (the <Link href="/papers/asymmetric-bonding" className="underline">bonding equilibrium</Link>; the kernel cannot tell the two apart, because it does not look).
                </p>
                <p className="text-sm text-ink-muted">
                    Subpath: <code>@figaro/sdk/agent</code>. Full subpath table below.
                </p>
            </MarketingSection>

            <MarketingSection title="Read, reconstruct, propose.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    <code>@figaro/sdk</code> is a TypeScript SDK with three runtime dependencies &mdash; <code>viem</code>, plus <code>@noble/curves</code> and <code>@noble/hashes</code> (the versions viem itself resolves, for the handoff ECDH). ESM, five subpath exports. Used from React frontends, server-side indexers, and headless agents.
                </p>
                <ul className="space-y-4">
                    <LabelledListRow label="@figaro/sdk" labelWidth="narrow" uppercase>
                        <strong>ABIs, event parsers, state reconstruction.</strong> <code>reconstruct()</code> one-shot state; <code>Topology</code> class for incremental replay; <code>fetchCoreEvents</code> bulk fetch. <code>buildCommitment</code>, <code>buildCommitmentSafe</code>, <code>buildDomain</code> for constructing commitments off-chain. <code>calculateBonds</code>, <code>calculateSettlement</code>, <code>validateBonds</code> for bond arithmetic.
                    </LabelledListRow>
                    <LabelledListRow label="/agent" labelWidth="narrow" uppercase>
                        <strong>Action proposer + dual-mode queue.</strong> <code>FigaroContext</code>, <code>proposeActions</code>, <code>ActionQueue</code>. Human-in-the-loop approval or fully autonomous submission via <code>WalletClient</code>. See the Agent SDK section above.
                    </LabelledListRow>
                    <LabelledListRow label="/derive" labelWidth="narrow" uppercase>
                        <strong>Attestation encoding/filtering, geo/handoff utilities, did:web resolution.</strong> Everything at the protocol tier that isn&apos;t kernel-critical but is commonly needed.
                    </LabelledListRow>
                    <LabelledListRow label="/clauses" labelWidth="narrow" uppercase>
                        <strong>Meta-clause validator + a generic content encoder.</strong> Canonical spec format, validated off-chain (Layer A); the batched, proof-based settlement path re-validates it in-proof against the registry-anchored spec, while the direct attestation path only merkle-binds (see <Link href="/clauses" className="underline">/clauses</Link>).
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
                        Clause-typed attestation from the coordinator: orderHash, processId, attester, clauseId, stage, contentRef (= keccak256(content)).
                    </LabelledListRow>
                    <LabelledListRow label="MinterRegistered" labelWidth="wide">
                        Florin token minter registry. Not relevant to settlement; relevant if you&apos;re indexing the token.
                    </LabelledListRow>
                </ul>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    Any client that can read the chain reconstructs any state.
                </p>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    <strong>Reading attestations.</strong> <code>fetchCoreEvents</code> covers the three FigaroCore events (<code>orderCommitted</code>, <code>orderResolved</code>, <code>processResolved</code>). <code>Attestation</code> is emitted by the <em>AttestationCoordinator</em> &mdash; a separate contract &mdash; so you read it directly against that address with <code>EV_ATTESTATION</code> and <code>parseAttestationLogs</code>:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mt-3 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { EV_ATTESTATION, parseAttestationLogs } from "@figaro/sdk";

const logs = await client.getLogs({
  address: ATTESTATION_COORDINATOR, // record: attestationCoordinator
  event: EV_ATTESTATION,
  fromBlock: DEPLOY_BLOCK,
  toBlock: "latest",
});
const attestations = parseAttestationLogs(logs);
// each: { orderHash, processId, attester, clauseId,
//         stage, contentRef, blockNumber, transactionHash }`}</code>
                </pre>
            </MarketingSection>

            <MarketingSection title="Install, fetch, reconstruct.">
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-2 mb-3 overflow-x-auto whitespace-pre"
                >
                    <code>npm install @figaro/sdk viem</code>
                </pre>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { fetchCoreEvents, reconstruct } from "@figaro/sdk";
import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http(process.env.RPC_URL),
});

// fetchCoreEvents(client, addresses, fromBlock?, toBlock?)
// — fromBlock/toBlock are positional args, not addresses fields.
const events = await fetchCoreEvents(
  client,
  { core: CORE_ADDRESS },   // deployment record: figaroCore
  DEPLOY_BLOCK,             // fromBlock (0n on a fresh devnet)
  "latest",
);

// reconstruct() returns a Map<processId, Process> directly.
const processes = reconstruct(events);
for (const [processId, process] of processes) {
  // process.rootBuyer, process.currency, process.cumulativeValue,
  // process.orders (Map<orderHash, Order>), process.resolved
}`}</code>
                </pre>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    The reconstruction is deterministic: the same events fetched against the same chain state produce the same output. No &ldquo;eventually consistent&rdquo; behavior, no reorg surprises beyond the chain&apos;s own finality assumptions.
                </p>
            </MarketingSection>

            <MarketingSection title="The deployment record.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    Where <code>CORE_ADDRESS</code> and the rest come from: per-network contract addresses ship as a <strong>deployment record</strong> &mdash; a JSON file the deploy script emits at <code>.deployments/&lt;network&gt;.json</code>. A local devnet writes <code>.deployments/local.json</code>; each public network&apos;s addresses are published in the <Link href="/spec" className="underline">/spec</Link> deployments table when that network goes live. Addresses are never hardcoded into these pages or the SDK &mdash; a local deployment rotates its addresses every redeploy, so read them from the record, not from prose. On a fresh devnet <code>DEPLOY_BLOCK</code> can be <code>0n</code>; on a public network, use the block the deploy landed in.
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`// .deployments/local.json — the full devnet record
{
  "chainId": 31337,
  "figaroCore": "0x…",
  "tokenAddress": "0x…",
  "permitTokenAddress": "0x…",
  "attestationCoordinator": "0x…",
  "witnessSwapAndCommitCoordinator": "0x…",
  "permit2": "0x…",
  "swapRouter": "0x…",
  "clauseRegistry": "0x…",
  "sellerRegistry": "0x…",
  "assemblyRegistry": "0x…",
  "florinToken": "0x…",
  "rpgfMinter": "0x…",
  "batchVerifier": "0x…",
  "rpgfArbitrator": "0x…",
  "daoTreasury": "0x…",
  "donationRail": "0x…",
  "multisender": "0x…"
}`}</code>
                </pre>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The record&apos;s keys map onto the SDK&apos;s <code>FigaroAddresses</code> with one rename: <code>figaroCore</code> &rarr; <code>core</code>, <code>tokenAddress</code> &rarr; <code>token</code>, and <code>attestationCoordinator</code> / <code>clauseRegistry</code> / <code>sellerRegistry</code> / <code>assemblyRegistry</code> keep their names. Those six are the <em>only</em> keys <code>FigaroAddresses</code> carries &mdash; <code>addressesFromDeploymentRecord</code> reads them and ignores the rest. Every other key (<code>permitTokenAddress</code>, <code>florinToken</code>, and the composition/funding contracts below) is read directly by name when you compose against it; the SDK does not fold them into its address map.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The composition and funding keys, one line each &mdash; catalogued in full on <Link href="/spec" className="underline">/spec</Link>:
                </p>
                <ul className="space-y-3 mb-4">
                    <LabelledListRow label="witnessSwapAndCommitCoordinator" labelWidth="wide">
                        Off-protocol swap-and-commit: swaps a permit-signed input token into the settlement currency and commits in one transaction, so a buyer can bond in a token the process isn&apos;t denominated in. Pairs with <code>permit2</code> (the witness-permit layer) and <code>swapRouter</code> (the swap venue) &mdash; devnet mocks; mainnet the canonical Permit2 + Uniswap Universal Router.
                    </LabelledListRow>
                    <LabelledListRow label="rpgfMinter · rpgfArbitrator" labelWidth="wide">
                        The optimistic RPGF distribution (<code>rpgfMinter</code>) and the composed bond-settlement forum it routes challenges to (<code>rpgfArbitrator</code>, behind the <code>IRpgfArbitrator</code> seam; devnet <code>MockArbitrator</code>).
                    </LabelledListRow>
                    <LabelledListRow label="batchVerifier" labelWidth="wide">
                        <code>FigaroBatchVerifier</code> &mdash; the proof-based batch settlement path (SP1 validity proof + the <code>ClauseRegistry</code>-anchored content check). Not a florin minter.
                    </LabelledListRow>
                    <LabelledListRow label="daoTreasury" labelWidth="wide">
                        Holds the DAO&apos;s genesis florin allocation (a multisig / Safe). It never signs kernel commitments &mdash; it buys through a funded operator EOA, because the kernel is ECDSA-only.
                    </LabelledListRow>
                    <LabelledListRow label="donationRail" labelWidth="wide">
                        The no-custody donation surface for match rounds &mdash; <code>donate</code> moves tokens straight through to the recipient and emits the one event a match formula consumes; the rail holds nothing.
                    </LabelledListRow>
                    <LabelledListRow label="multisender" labelWidth="wide">
                        Composed post-settlement batch dispersal (one payment, many recipients, one transaction). Mainnet composes the canonical ownerless Disperse (<code>0xD152f549545093347A162Dce210e7293f1452150</code>, same address across chains); devnet mirrors it with <code>MockDisperse</code>.
                    </LabelledListRow>
                </ul>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    Three token addresses appear; only one is a trade currency:
                </p>
                <ul className="space-y-3">
                    <LabelledListRow label="tokenAddress" labelWidth="wide">
                        The <strong>trade / settlement currency</strong> &mdash; the ERC-20 that bonds and payments are denominated in (<code>FigaroAddresses.token</code>). Devnet uses a mock ERC-20; a public deployment names a real ERC-20 (e.g. USDC).
                    </LabelledListRow>
                    <LabelledListRow label="permitTokenAddress" labelWidth="wide">
                        A second devnet ERC-20 (EIP-2612-capable), used as a swap-funding input token and a seller-catalogue example. A devnet convenience token, not a separate currency.
                    </LabelledListRow>
                    <LabelledListRow label="florinToken" labelWidth="wide">
                        The protocol token, the florin (<Link href="/papers/florin-schelling-point-token" className="underline">FLORIN</Link>). Not a trade currency &mdash; you never bond or pay in it.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Handing a counterparty a link.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The app&apos;s public surfaces are plain URLs with a single query parameter &mdash; read at the edge, no login required. A seller hands a buyer a &ldquo;buy from me&rdquo; link; anyone audits a settled process from its id.
                </p>
                <ul className="space-y-3">
                    <LabelledListRow label="/s/view?seller=" labelWidth="wide">
                        The seller&apos;s storefront &mdash; browse their catalogue and place a bonded order. Value is the seller address.
                    </LabelledListRow>
                    <LabelledListRow label="/s/checkout?seller=" labelWidth="wide">
                        Straight to checkout for that seller &mdash; review the cart and place a bonded order.
                    </LabelledListRow>
                    <LabelledListRow label="/orders/view?process=" labelWidth="wide">
                        A process&apos;s live status and record, keyed by <code>processId</code> &mdash; readable by anyone, no wallet.
                    </LabelledListRow>
                    <LabelledListRow label="/builders/designer/view?slug=" labelWidth="wide">
                        Read-only inspect of an assembly, keyed by its derived slug.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="The kernel is narrow. The ecosystem composes around it.">
                <div className="border-l-2 border-default pl-6 mb-8">
                    <p className="text-sm text-ink-body leading-relaxed">
                        <strong>Implementation status.</strong> Currently wired: Kleros evidence export, XMTP messaging, IPFS storage, emissions disclosure attestations. Everything else below is a <strong>compositional surface</strong> &mdash; an architectural slot integrators can build against, with named vendors as illustrative examples rather than current integrations.
                    </p>
                </div>

                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Figaro&apos;s useful compositions are predominantly external: the kernel does not include a dispute forum, a carbon-offset market, a prediction market, an insurance pool, a lending facility, a tax-reporting service, an identity provider, a storage layer, or a messaging fabric. An assembly names which external surfaces it composes with. A concrete walkthrough first, then the surface area.
                </p>

                <div className="border-l-2 border-default pl-6 mb-8">
                    <h3 className="text-base font-semibold text-ink-heading mb-3">
                        Architectural example &mdash; carbon offset before settlement
                    </h3>
                    <p className="text-sm text-ink-body leading-relaxed mb-4">
                        A delivery process runs through its normal lifecycle. Before the buyer calls <code>resolveProcess</code>, the emissions clause has fired an attestation declaring <em>X</em> grams CO<sub>2</sub>e emitted. The buyer commits a sub-order against an offset seller registered with the assembly, adding the offset purchase to the same process before closing. (The offset seller is whichever counterparty the assembly admits &mdash; any bonded seller whose value-add is retirement.)
                    </p>
                    <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                        <li><strong>UI surfaces the option.</strong> A live quote from a bonded offset seller registered against the assembly.</li>
                        <li><strong>Buyer commits a sub-order.</strong> Same <code>processId</code>, non-zero <code>cumulativeValue</code>, offset seller as seller. Buyer bonds <code>2&times;Y</code>; seller bonds 2&times; cumulative value (the <Link href="/papers/asymmetric-bonding" className="underline">N-party bonding equilibrium</Link>).</li>
                        <li><strong>Wallet handles any token swap.</strong> Multi-token bookkeeping is resolved before the commit; the kernel sees a single-currency sub-order.</li>
                        <li><strong>Seller delivers.</strong> Burns the offset and posts the burn receipt as an attestation against the sub-order.</li>
                        <li><strong>Buyer calls <code>resolveProcess</code> once.</strong> Main order and offset sub-order settle atomically. Offset receipt joins the evidence bundle.</li>
                    </ol>
                    <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                        Result: one settled process whose evidence bundle contains both the commerce record and an offset record verifiable against the burn receipt&apos;s on-chain attestation.
                    </p>
                </div>

                <h3 className="text-heading-h3 text-ink-heading mb-4">Compositional surfaces.</h3>
                <ul className="space-y-4">
                    <LabelledListRow label="Forums" uppercase>
                        <strong>Kleros, SIAC, ICC, courts.</strong> Parties&apos; agreement designates the forum; Figaro exports its evidence bundle there. Kernel does not adjudicate. Kleros wired today; other forums are off-chain referents named in the agreement. See <a href="/papers/on-chain-evidence" className="underline">On-Chain Evidence, Off-Chain Adjudication</a>.
                    </LabelledListRow>
                    <LabelledListRow label="Offsets" uppercase>
                        <strong>Any retirement provider that bonds as a seller.</strong> Architectural slot &mdash; the offset purchase is an ordinary bonded sub-order. Walkthrough above.
                    </LabelledListRow>
                    <LabelledListRow label="Prediction" uppercase>
                        <strong>Polymarket, Augur.</strong> Compositional target for outcome-resolution oracles that feed attestations gating a process.
                    </LabelledListRow>
                    <LabelledListRow label="Insurance" uppercase>
                        <strong>Nexus Mutual, Sherlock.</strong> Compositional target for smart-contract-failure cover, or cover on the real-world goods a process carries, priced against Figaro&apos;s evidence bundle. The bond itself is not an insurable position &mdash; a policy on bond forfeiture would hedge away the deterrent.
                    </LabelledListRow>
                    <LabelledListRow label="Lending" uppercase>
                        <strong>Aave, Compound, Morpho.</strong> Compositional target for ordinary treasury borrowing &mdash; a lender is a separate counterparty in a separate process. The bond itself is never financed: it is the party&apos;s own staked deterrent.
                    </LabelledListRow>
                    <LabelledListRow label="Payout routing" uppercase>
                        <strong>Disperse.</strong> Compositional target for post-settlement batch dispersal &mdash; one payment, many recipients, one transaction; a wallet splits its own receipts to earmarked addresses (fiscal remittance, savings, obligations), and the self-sovereign fiscal trail falls out as a byproduct. Canonical ownerless deployment, same address across chains; the devnet stack rehearses it with an interface-matching mock.
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
                    <strong>How composition stays safe.</strong> An external mechanism that could override resolution, claw back a bond, or revoke a counterparty mid-process would import an escape hatch the kernel was designed to deny. The coordinator pattern gives three sufficient conditions under which composition preserves the bonding equilibrium: the external reads kernel state and emits its own evidence, but never writes to kernel state, never reverses a resolution, and never controls a bond. Integrators bringing a new external into an assembly should verify the composition against the same conditions. Property-side treatment, with the escape-hatch theorem it rests on: <Link href="/builders/composability" className="underline">Composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to look">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro</a>. SDK lives at <code>sdk/</code>.</li>
                    <li><strong>SDK README:</strong> <code>sdk/README.md</code> in the repo. Covers every subpath export and the test-harness conventions.</li>
                    <li><strong>ABIs:</strong> <code>CORE_ABI</code>, <code>ATTESTATION_COORDINATOR_ABI</code>, <code>CLAUSE_REGISTRY_ABI</code>, <code>ERC20_ABI</code>, <code>SELLER_REGISTRY_ABI</code>, <code>FLORIN_TOKEN_ABI</code>. All exported from <code>@figaro/sdk</code>; canonical contract surface at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Type declarations as documentation:</strong> the package ships <code>dist/**/*.d.ts</code> and <code>src/</code>. Every exported primitive carries a docblock stating its invariants in plain arithmetic &mdash; <code>bonds.d.ts</code>, <code>agreement.d.ts</code>, and <code>commitments.d.ts</code> are the ones to read first. If the README is ambiguous, read the declaration.</li>
                </ul>
                <p className="mt-8 text-sm text-ink-muted leading-relaxed">
                    Related:&nbsp;
                    <Link href="/protocol" className="underline">Protocol</Link>{" "}(kernel invariants);&nbsp;
                    <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>{" "}(academic frame);&nbsp;
                    <Link href="/builders" className="underline">Builders</Link>{" "}(composition tools);&nbsp;
                    <Link href="/local-commerce" className="underline">Local Commerce</Link>{" "}(reference assembly);&nbsp;
                    <Link href="/discover" className="underline">Discover</Link>{" "}(seller catalogue);&nbsp;
                    <Link href="/clauses" className="underline">Clauses</Link>{" "}(attestation content for indexers).
                </p>
            </MarketingSection>

            <MarketingSection title="More for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the five builder roles: contract authors, clause authors, assembly authors, token issuance, humans and agents.</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; the validation architecture, the reference clauses, and the authoring checklist.</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                    </li>
                    <li>
                        <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>
                        <span className="text-ink-body"> &mdash; how autonomous agents participate through the same primitives humans do; ERC-8004 interop and how an operator transacts.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
