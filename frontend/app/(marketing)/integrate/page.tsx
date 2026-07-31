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

            <MarketingSection title="Seven event types are the direct path&rsquo;s whole event surface.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every kernel state change emits an event. Replayed into a state machine, they produce the complete ledger position <code>FigaroCore</code> itself holds. The batched settlement path is a <em>separate</em> contract with its own two events and its own state &mdash; it emits none of these; read the section below before you gate anything on kernel state.
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
                    Any client that can read the chain reconstructs any state on this path.
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

            <MarketingSection title="&ldquo;Is it settled?&rdquo; &mdash; ask the right contract.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>There are two settlement paths and they are disjoint state universes.</strong> <code>FigaroCore</code> (direct) and <code>FigaroBatchVerifier</code> (batched, proof-based) share no state and never call each other. The batch path replaces the whole <code>commit</code>-plus-<code>resolveProcess</code> lifecycle inside the proof, so <strong>a batch-settled process never acquires kernel status and emits no kernel event</strong> &mdash; <code>core.orderStatus(orderHash)</code> returns <code>0</code> for it, permanently. The converse holds: a kernel-settled process is never inside a batch. Nothing migrates between them.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    So the two things above &mdash; <code>reconstruct()</code> over <code>fetchCoreEvents</code>, and any gate you write on <code>orderStatus</code> &mdash; see the <em>direct path only</em>. Not &ldquo;late&rdquo;: not at all. <code>orderStatus == 0</code> means <em>&ldquo;not on this path&rdquo;</em>, never <em>&ldquo;not settled&rdquo;</em>, and concluding the latter is the one mistake this section exists to prevent. On the batch path there is <strong>no per-order settled flag on chain</strong>: the order&apos;s state lives under the verifier&apos;s <code>stateRoot()</code>, and the public facts are the batch that carried it, the attestations it re-emitted, and the ERC-20 transfers it executed. Both ABIs ship in the SDK &mdash; <code>CORE_ABI</code> and <code>BATCH_VERIFIER_ABI</code>:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { CORE_ABI, BATCH_VERIFIER_ABI, USAGE_COUNTER_ABI } from "@figaro/sdk";

// DIRECT path — the kernel answers for itself.
const status = await client.readContract({
  address: CORE_ADDRESS,        // record: figaroCore
  abi: CORE_ABI,
  functionName: "orderStatus",
  args: [orderHash],
});                             // 0 UNKNOWN · 1 ACTIVE · 2 RESOLVED
// 0 does NOT mean "not settled" — it means "not on this path".

// BATCH path — no per-order flag exists. Read the verifier's own state.
const root = await client.readContract({
  address: BATCH_VERIFIER,      // record: batchVerifier
  abi: BATCH_VERIFIER_ABI,
  functionName: "stateRoot",
});
const batches = await client.getLogs({
  address: BATCH_VERIFIER,
  event: BATCH_VERIFIER_ABI.find((e) => e.name === "BatchSettled"),
  fromBlock: DEPLOY_BLOCK, toBlock: "latest",
});
// BatchSettled(uint64 batchId, bytes32 prevStateRoot,
//              bytes32 newStateRoot, uint256 positionCount)

// Per-order evidence on the batch path: the verifier RE-EMITS Attestation.
// It shares the coordinator's topic hash (0x754607f1…) — filter by
// contract ADDRESS, never by topic, or you will merge the two universes.
const attestations = await client.getLogs({
  address: BATCH_VERIFIER,
  event: BATCH_VERIFIER_ABI.find((e) => e.name === "Attestation"),
  fromBlock: DEPLOY_BLOCK, toBlock: "latest",
});`}</code>
                </pre>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>Exactly one thing crosses the seam: the RPGF usage accrual</strong>, carried by <code>settleBatch</code> into <code>UsageCounter.applyBatchAccrual</code> as proved numbers &mdash; never as kernel state. So the same rule governs adoption reads, and the SDK already ships it: <strong>fold BOTH streams</strong>. <code>UsageRecorded</code> is the direct path and is a per-process <em>increment</em>; <code>BatchUsageRecorded</code> is the batch path and is <em>cumulative</em> &mdash; a later record <strong>REPLACES</strong> an earlier one rather than adding to it. <code>fetchUsageRecords</code> alone silently under-reports every artifact whose trade moved to batches; pair it with <code>fetchBatchUsageRecords</code> and pass both to <code>computeUsageAccruals</code>. On chain the merge is already done for you: read <code>scoreOf(artifact, period)</code>, which sums BOTH paths&apos; scores &mdash; never <code>accrualOf</code> alone. Scores are summed; the <code>c</code>/<code>d</code> components never are (the same seller may trade on both sides and the chain holds no seller SETS to union, so adding breadth would pay for breadth nobody had).
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`// On chain: scoreOf already merges the two paths.
const score = await client.readContract({
  address: USAGE_COUNTER,       // record: usageCounter
  abi: USAGE_COUNTER_ABI,
  functionName: "scoreOf",
  args: [artifact, period],
});

// Off chain, if you are mirroring: fold both event streams.
import { fetchUsageRecords, fetchBatchUsageRecords,
         computeUsageAccruals } from "@figaro/sdk";
const direct = await fetchUsageRecords(client, USAGE_COUNTER, toBlock);
const batch  = await fetchBatchUsageRecords(client, USAGE_COUNTER, toBlock);`}</code>
                </pre>
                <p className="text-sm text-ink-muted leading-relaxed">
                    Contract-by-contract statement of the seam, with the which-function-answers-what table: <Link href="/spec" className="underline">/spec</Link>. Composition targets that read order state: <Link href="/builders/composability" className="underline">Composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Before you sign, recompute the hash yourself.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>Settlement does not trust any website; presentation at the signing moment does.</strong> The kernel verifies two EIP-712 signatures over a struct whose <code>agreementHash</code> is the merkle root of the agreement&apos;s sections &mdash; so once a commitment is on chain, what was agreed is fixed by arithmetic, and no origin, ours included, can restate it. But the wallet prompt shows you 32 bytes; the readable document sits beside it, on a page. <strong>A compromised origin can display document <em>D</em> and ask your wallet to bind <code>hash(D&prime;)</code></strong>, and nothing in the signing flow catches that. The answer is not to trust the page harder &mdash; it is to recompute the root off-origin, on your own machine, from the SDK, and compare.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-3">
                    Four public primitives are all it takes. <code>sectionDataHash</code> and <code>computeSectionLeaf</code> show you <em>what each hash covers</em>, section by section; <code>computeAgreementHash</code> recomputes the root; <code>verifyCommitmentSignature</code> answers, after the fact, whether an address really signed the struct. All four are root <code>@figaro/sdk</code> exports &mdash; the same primitives the kernel mirrors:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { computeAgreementHash, computeSectionLeaf,
         sectionDataHash, verifyCommitmentSignature } from "@figaro/sdk";

// \`shown\`     — the agreement JSON the page displayed.
// \`typedData\` — the EIP-712 payload the WALLET displayed (domain + message),
//               copied out of the signing prompt, not out of the page.
for (const section of shown.sections) {
  console.log(section.clause, sectionDataHash(section),
                              computeSectionLeaf(section));
}

const recomputed = computeAgreementHash(shown);
if (recomputed.toLowerCase() !==
    typedData.message.agreementHash.toLowerCase()) {
  throw new Error("MISMATCH — the page showed one document and asked the " +
                  "wallet to bind another. Do not sign.");
}

// After the fact: did each party really sign this struct?
const commitment = { ...typedData.message,
  payment: BigInt(typedData.message.payment),
  expectedCumulativeValue: BigInt(typedData.message.expectedCumulativeValue),
  salt: BigInt(typedData.message.salt),
  deadline: BigInt(typedData.message.deadline) };
const ctx = { chainId: Number(typedData.domain.chainId),
              core: typedData.domain.verifyingContract };
await verifyCommitmentSignature(commitment, buyerSig, commitment.buyer, ctx);
await verifyCommitmentSignature(commitment, sellerSig, commitment.seller, ctx);`}</code>
                </pre>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    A ready-made runner is in the repo if you would rather not write the glue: <a href="https://github.com/figaro-protocol/Figaro/blob/main/scripts/verify-signed-agreement.mjs" target="_blank" rel="noopener noreferrer" className="underline"><code>scripts/verify-signed-agreement.mjs</code></a> takes the two files, prints every section leaf and the recomputed root, reports MATCH or MISMATCH against the hash in the typed data, adds per-party VALID/INVALID when you pass <code>--buyer-sig</code>/<code>--seller-sig</code>, and exits <code>0</code> only if every check passed. It reads files and calls the exports above &mdash; nothing cryptographic is implemented in it.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>After the fact, and without a wallet:</strong> <code>/audit/view?process=</code> renders per-order buyer and seller signature verdicts to anyone. Note where the bytes come from, because it is not where you would look first &mdash; <code>OrderCommitted</code> carries every <code>Commitment</code> field but <em>no signatures</em>. The signature bytes live on chain only inside the commit transaction&apos;s <strong>calldata</strong> (<code>commit(c, buyerSig, sellerSig)</code>), which also carries the signed struct verbatim; the reader decodes it, re-binds it to the order by recomputing the order hash, and re-verifies. A commit it cannot parse reads &ldquo;unavailable&rdquo;, never a false verdict.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    <strong>What this deliberately does not do</strong> is make the wallet&apos;s own prompt legible field by field. That is a <em>kernel</em> question: <code>Commitment</code> binds the agreement by root, so a wallet renders a hash. Changing it means changing <code>CommitmentTypes</code>, and the kernel is frozen &mdash; and that same root-binding is precisely what lets both checks above run outside any origin. The boundary is the design, not a gap in it.
                </p>
            </MarketingSection>

            <MarketingSection title="Getting onto the batch path: submit to a relay, or run one.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The direct path you drive end to end yourself: collect both signatures, approve the bonds, broadcast <code>commit</code>, later <code>resolveProcess</code>. The batch path has a different shape, because <code>settleBatch</code> takes an SP1 validity proof over a <em>whole batch</em>. It is nonetheless <strong>permissionless</strong> &mdash; <code>FigaroBatchVerifier.settleBatch</code> is <code>external</code> with no caller gate, no owner, no fee and no upgrade path, so anyone who can produce the proof can settle. The ordinary route is simply not to produce it: hand your signed artifact to a <strong>sequencer</strong> &mdash; an HTTP relay that pools operations, assembles a batch, proves it, and settles it.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-3">
                    <strong>Do not hand-roll the wire format &mdash; it is already the SDK&apos;s.</strong> <code>SequencerClient</code> (<code>@figaro/sdk/agent</code>) emits exactly the JSON the endpoint accepts, and the same <code>Commitment</code> + signature hex you would have broadcast directly:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { SequencerClient } from "@figaro/sdk/agent";

const seq = new SequencerClient({ url: SEQUENCER_URL }); // deployment config
if (!await seq.isAvailable()) { /* fall back to direct FigaroCore */ }

const { id } = await seq.submitCommit(commitment, buyerSig, sellerSig);
// { id: 1 } — resubmitting the SAME order returns the SAME id.

await seq.submitResolve(processId, commitments, buyerSig);
await seq.submitAttestAsSeller({ role, target, clauseId, stage,
                                 contentRef, sellerSig, proof });
await seq.status();   // { state_root, pending_ops,
                      //   pending_usage_claims, batches_settled }`}</code>
                </pre>
                <p className="text-sm text-ink-body leading-relaxed mb-3">
                    Four endpoints, and that is the whole surface &mdash; settled state is read from the chain, never from a relay. Every error body is <code>{`{ "error": "…" }`}</code>.
                </p>
                <div className="overflow-x-auto -mx-6 px-6 mb-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Endpoint</th>
                                <th scope="col" className="py-2 pr-4">Body</th>
                                <th scope="col" className="py-2">Success</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">POST /submit</td>
                                <td className="py-2 pr-4 font-mono text-xs">{`{"operation": {"Commit"|"Resolve"|"AttestAsSeller"|"AttestAsBuyer": {…}}}`}</td>
                                <td className="py-2 font-mono text-xs">{`200 {"id": n}`}</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">POST /submit-usage</td>
                                <td className="py-2 pr-4"><code className="font-mono text-xs">{`{"claim": …}`}</code> &mdash; the RPGF leg; build these with <code className="font-mono text-xs">buildUsageClaims</code>, never by hand.</td>
                                <td className="py-2 font-mono text-xs">{`200 {"pending": n}`}</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">GET /health</td>
                                <td className="py-2 pr-4 text-ink-body">Liveness + bounded counts.</td>
                                <td className="py-2 font-mono text-xs">{`{status, pending_ops, pending_usage_claims, batches_settled}`}</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">GET /status</td>
                                <td className="py-2 pr-4 text-ink-body">The same, plus the relay&apos;s local <code className="font-mono text-xs">state_root</code> mirror. <code className="font-mono text-xs">SequencerClient.status()</code> reads this one.</td>
                                <td className="py-2 font-mono text-xs">{`{state_root, …}`}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>Admission is idempotent, and on <em>on-chain identity</em> rather than bytes</strong> &mdash; a <code>Commit</code> is keyed by its order hash, a <code>Resolve</code> by its process id, an attestation by (order hash, clauseId, stage, contentRef). ECDSA signatures are not unique per digest, so a <em>re-signed</em> duplicate deduplicates too; you get the original id back and nothing is enqueued twice. (Usage claims dedupe on the claim&apos;s own bytes &mdash; a claim carries no signature, so byte identity is the right notion of &ldquo;same claim&rdquo; there.) The failure codes: <code>400</code> for a signature or witness-gate rejection, carrying the kernel&apos;s own reason string (<code>&ldquo;buyer sig mismatch: recovered 0x15d3…, expected 0x9965…&rdquo;</code>), and for malformed JSON; <code>422</code> for a body that is valid JSON but not a <code>KernelOp</code>; <code>413</code> over the body cap (1 MiB by default); <code>503</code> when the mempool is at capacity &mdash; retry after the next batch drains it. <code>503</code> is capacity, never rejection: at the cap it is the <em>arriving</em> submission that is refused, so an acknowledged id is never silently dropped.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>A relay, not an authority &mdash; and this is the point, not a disclaimer.</strong> Because <code>settleBatch</code> is permissionless, a sequencer is one relay among any number. It holds no keys of yours and grants no privilege; its own signer pays gas for the settlement transaction and has no protocol role. Its admission checks call the <em>same</em> kernel functions the proof runs &mdash; the same EIP-712 recovery, the same attestation witness gates &mdash; so it can reject <em>earlier</em> than the proof would, and can never accept more than the proof would. Its honest powers are therefore exactly two: <strong>censor and delay</strong>. It cannot forge, cannot alter a struct you signed, cannot settle anything you did not sign, and cannot take a bond. If it censors you, run your own, or fall back to the direct path &mdash; the artifacts are the same signed structs either way.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    <strong>Honest scope: there is no hosted public sequencer to point you at today.</strong> No deployment-record key carries one, because the endpoint address is deployment configuration, not a protocol constant &mdash; treat <code>SEQUENCER_URL</code> the way you treat an RPC URL. The first-class option is to run your own: the relay is a Rust binary in the repo (<code>prover/sequencer</code>), started explicitly with <code>cargo run -p figaro-sequencer --bin sequencer</code> against the deployed addresses (<code>RPC_URL</code>, <code>CHAIN_ID</code>, <code>FIGARO_CORE_ADDRESS</code>, <code>BATCH_VERIFIER_ADDRESS</code>, <code>USAGE_COUNTER_ADDRESS</code>; <code>LISTEN_ADDR</code> defaults to <code>0.0.0.0:3001</code>). Its <a href="https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md" target="_blank" rel="noopener noreferrer" className="underline">README</a> carries the full environment table and the queue-bound flags.
                </p>
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
  "membersRegistry": "0x…",
  "assemblyRegistry": "0x…",
  "florinToken": "0x…",
  "usageCounter": "0x…",
  "rpgfMinter": "0x…",
  "batchVerifier": "0x…",
  "daoTreasury": "0x…",
  "multisender": "0x…"
}`}</code>
                </pre>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The record&apos;s keys map onto the SDK&apos;s <code>FigaroAddresses</code> with one rename: <code>figaroCore</code> &rarr; <code>core</code>, <code>tokenAddress</code> &rarr; <code>token</code>, and <code>attestationCoordinator</code> / <code>clauseRegistry</code> / <code>membersRegistry</code> / <code>assemblyRegistry</code> keep their names. Those six are the <em>only</em> keys <code>FigaroAddresses</code> carries &mdash; <code>addressesFromDeploymentRecord</code> reads them and ignores the rest. Every other key (<code>permitTokenAddress</code>, <code>florinToken</code>, and the composition/funding contracts below) is read directly by name when you compose against it; the SDK does not fold them into its address map.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The composition and funding keys, one line each &mdash; catalogued in full on <Link href="/spec" className="underline">/spec</Link>:
                </p>
                <ul className="space-y-3 mb-4">
                    <LabelledListRow label="witnessSwapAndCommitCoordinator" labelWidth="wide">
                        Off-protocol swap-and-commit: swaps a permit-signed input token into the settlement currency and commits in one transaction, so a buyer can bond in a token the process isn&apos;t denominated in. Pairs with <code>permit2</code> (the witness-permit layer) and <code>swapRouter</code> (the swap venue) &mdash; devnet mocks; mainnet the canonical Permit2 + Uniswap Universal Router.
                    </LabelledListRow>
                    <LabelledListRow label="usageCounter · rpgfMinter" labelWidth="wide">
                        <code>UsageCounter</code> counts a settled process&apos;s use of a clause or assembly at the moment it happens: <code>recordClauseUsage</code> is permissionless and verifies for itself that the order resolved and that the artifact was merkle-committed in the signed <code>agreementHash</code>, so nothing about the caller is trusted. What it does check about the trade is the seller: a record whose seller of record holds no live <code>MembersRegistry</code> stake reverts (<code>SellerNotStaked</code>), and breadth is counted in exactly those distinct staked sellers. Accrual buckets into nine annual periods and a period&apos;s counts are final once it ends. <code>RpgfMinter.claim(periodId, artifacts)</code> then pays pro rata from that closed period&apos;s own budget &mdash; the claim unit is the period, one claim per wallet per period; the three rising tranches are only how the nine budgets were grouped at deploy. Nothing is posted, bonded, or challenged, so there is no forum to wire.
                    </LabelledListRow>
                    <LabelledListRow label="batchVerifier" labelWidth="wide">
                        <code>FigaroBatchVerifier</code> &mdash; the proof-based batch settlement path (SP1 validity proof + the <code>ClauseRegistry</code>-anchored content check). Not a florin minter.
                    </LabelledListRow>
                    <LabelledListRow label="daoTreasury" labelWidth="wide">
                        Holds the DAO&apos;s genesis florin allocation (a multisig / Safe). It never signs kernel commitments &mdash; it buys through a funded operator EOA, because the kernel is ECDSA-only.
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
                    <LabelledListRow label="/audit/view?process=" labelWidth="wide">
                        The same process as an <em>evidence</em> surface: hashes, clause evidence, and per-order buyer/seller signature verdicts re-verified from the commit transaction&apos;s calldata. Also walletless. (<code>/audit</code> with no <code>process</code> is the standalone hash-verifier: paste content or a hash from an audit bundle.)
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
                    <li><strong>ABIs:</strong> <code>CORE_ABI</code>, <code>ATTESTATION_COORDINATOR_ABI</code>, <code>CLAUSE_REGISTRY_ABI</code>, <code>ERC20_ABI</code>, <code>MEMBERS_REGISTRY_ABI</code>, <code>FLORIN_TOKEN_ABI</code>. All exported from <code>@figaro/sdk</code>; canonical contract surface at <Link href="/spec" className="underline">/spec</Link>.</li>
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
