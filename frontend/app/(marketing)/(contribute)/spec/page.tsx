import type { Metadata } from "next";
import Link from "next/link";
import { ContractEntry } from "@/components/shared/ContractEntry";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { SettlementPathsFigure } from "@/components/figures/SettlementPathsFigure";

export const metadata: Metadata = {
    title: "Specifications — Figaro Protocol",
    description: "Canonical protocol surface: kernel, attestation coordinator, registries, token, optional protocol contracts — plus the sequencer, the batch path's one off-chain piece.",
};

const GH = "https://github.com/figaro-protocol/Figaro/blob/main/src";

export default function Specifications() {
    return (
        <>
            <MarketingHero
                title="The canonical surface."
                lead={
                    <>
                        Every contract is a permissionless primitive. No contract belongs to a dapp. Solidity 0.8.26. Source-available at{" "}
                        <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">figaro-protocol/Figaro</a>.
                    </>
                }
            />

            <MarketingSection title="Inheritance">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    This page catalogues the <strong>on-chain composition</strong> layer (the kernel plus the permissionless primitives built around it). Each contract below inherits the kernel&apos;s ownerless / tamper-evident / atomic-settlement properties &mdash; the invariants stated on <Link href="/kernel" className="underline">Kernel</Link>. The kernel in turn inherits execution security from whichever EVM chain it is deployed on &mdash; network → kernel → on-chain composition → off-chain composition → trade. Remove any floor and what&apos;s above collapses.
                </p>
                <p className="text-sm text-ink-muted">
                    Off-chain composition lives at <Link href="/builders" className="underline">/builders</Link>; the stack as a whole is summarised on <Link href="/" className="underline">the home page</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Kernel">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FigaroCore"
                        title="FigaroCore.sol"
                        href={`${GH}/FigaroCore.sol`}
                        meta="2 fns · 3 mappings · no owner"
                        desc="The protocol kernel: holds every bonded commitment, and settles a process atomically when its buyer resolves. commit (unified dual-signed) and resolveProcess. EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution. Settlement state is the public mapping orderStatus(bytes32 orderHash) → uint8: 0 UNKNOWN, 1 ACTIVE, 2 RESOLVED. It answers for the DIRECT path only — a process settled through FigaroBatchVerifier (below) is never written here and reads 0 forever, so 0 means 'not on this path', never 'not settled'. See 'Two settlement paths' below."
                    />
                    <ContractEntry
                        id="CommitmentTypes"
                        title="CommitmentTypes.sol"
                        href={`${GH}/CommitmentTypes.sol`}
                        desc="EIP-712 typed structs and hash functions. Single Commitment struct for root and sub-orders; processId zero for root."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Attestation &amp; clause">
                <ul className="space-y-4">
                    <ContractEntry
                        id="AttestationCoordinator"
                        title="AttestationCoordinator.sol"
                        href={`${GH}/AttestationCoordinator.sol`}
                        meta="receipt-bound · merkle-only"
                        desc="Three attest modes (seller / buyer / resolver). A merkle inclusion proof binds each attestation to the signed agreementHash, and the evidence is content-hashed; the chain validates no content shape. Attestations whose clause was not committed cannot land (InvalidInclusionProof revert)."
                    />
                </ul>
                <p className="text-sm text-ink-muted leading-relaxed mt-4 mb-2">
                    <code>AttestationCoordinator</code>&apos;s three attest entry points, copied verbatim from source:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-6 overflow-x-auto whitespace-pre"
                >
                    <code>{`function attestAsSeller(
    CommitmentTypes.Commitment calldata role,
    CommitmentTypes.Commitment calldata target,
    bytes32 clauseId,
    uint8 stage,
    bytes32 sectionHash,
    bytes32[] calldata proof,
    bytes32 contentRef
) external;

function attestAsBuyer(
    CommitmentTypes.Commitment calldata target,
    bytes32 clauseId,
    uint8 stage,
    bytes32 sectionHash,
    bytes32[] calldata proof,
    bytes32 contentRef
) external;

function attestViaResolver(
    CommitmentTypes.Commitment calldata target,
    bytes32 clauseId,
    uint8 stage,
    bytes32 sectionHash,
    bytes32[] calldata proof,
    bytes32 contentRef
) external;`}</code>
                </pre>
                <ul className="space-y-4">
                    <ContractEntry
                        id="ClauseRegistry"
                        title="ClauseRegistry.sol"
                        href={`${GH}/ClauseRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only clause anchoring, first-write-wins. clauseId is the bare human-readable name; the on-chain identity/dedup key is keccak256(abi.encode(clauseId, version)), so name+version together form the key. contentURI points at the off-chain JSON spec, and the registry stores its keccak256 contentHash as the integrity anchor the batch verifier binds witness specs to (contentHashOf). The registry validates no content shape itself — a registered clause is immediately attestable, and settleable through the proven path."
                    />
                    <ContractEntry
                        id="FigaroBatchVerifier"
                        title="FigaroBatchVerifier.sol"
                        href={`${GH}/FigaroBatchVerifier.sol`}
                        meta="SP1 proof · open-world content check"
                        desc="Batched settlement via a single SP1 validity proof. A generic in-proof engine validates each clause's content against its spec (supplied as a witness); settleBatch accepts the batch only if every (clauseId → witness-spec hash) binding equals ClauseRegistry.contentHashOf(clauseId), then reconciles net token positions and re-emits attestation events. The program verification key covers the engine, not a clause list — a never-seen clause settles with zero code changes. It shares NO state with FigaroCore and never calls it: this path replaces the whole commit-plus-resolveProcess lifecycle, so a batch-settled process writes no kernel orderStatus and emits no kernel event. Its own state is stateRoot() (bytes32) plus batchCount() (uint64), advanced per BatchSettled. No owner, no fee, no upgrade. A local devnet wires MockSP1Verifier; the deployment record wires Succinct's SP1 gateway + program vkey from env wherever a network names one."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Clause validation">
                <p className="text-base text-ink-body leading-relaxed">
                    Clause content is validated <strong>off-chain</strong> (the Layer-A TypeScript SDK) before signing, and re-validated <strong>on-chain</strong> on the batched, proof-based settlement path &mdash; a generic SP1 engine checks each clause against its registry-anchored spec, so a never-seen clause settles with zero per-clause on-chain code. The direct attestation path merkle-binds but validates no content shape. <code>figaro-topology</code> is agreement-only &mdash; committed at signing, with no runtime attestation. The full inventory &mdash; every clauseId and what it carries &mdash; is on <Link href="/clauses" className="underline">Clauses</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Two settlement paths, two disjoint state universes." sectionId="settlement-paths">
                <SettlementPathsFigure className="mb-6" />
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> share no state and never call each other. The batch path replaces the entire direct lifecycle &mdash; <code>commit</code> and <code>resolveProcess</code> both execute inside the proof &mdash; so <strong>a batch-settled process never acquires kernel status</strong>: <code>core.orderStatus(orderHash)</code> returns <code>0</code> for it, permanently. The converse holds too: a kernel-settled process is never inside a batch. There is no migration between the two, and none is planned; the split is the design, not a gap in it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>The consequence for anything you build: a gate on <code>orderStatus</code> cannot see batched trade.</strong> Not &ldquo;sees it late&rdquo; &mdash; cannot see it at all. That is already true inside the protocol: <code>AttestationCoordinator</code> requires an ACTIVE order and <code>UsageCounter.recordClauseUsage</code> requires a RESOLVED one, and a batch-settled process satisfies neither, forever &mdash; which is exactly why the batch proof carries the RPGF usage accrual across itself, as proved numbers, into <code>UsageCounter.applyBatchAccrual</code>. That accrual is the <em>only</em> thing that crosses. No status, no process record, no attestation state.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">
                    The split is exhaustively model-checked, not just asserted: <a href="https://github.com/figaro-protocol/Figaro/blob/main/formal/SettlementUniverses.tla" target="_blank" rel="noopener noreferrer" className="underline"><code>formal/SettlementUniverses.tla</code></a> treats <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> as one composed system across every interleaving and checks 21 invariants &mdash; among them that no order settles in both universes and that a batch-settled order never flips a kernel status.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    So &ldquo;is this settled?&rdquo; is answered by a different contract on each path. Ask the right one:
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Question</th>
                                <th scope="col" className="py-2 pr-4">Direct path &mdash; <code>FigaroCore</code></th>
                                <th scope="col" className="py-2">Batch path &mdash; <code>FigaroBatchVerifier</code></th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4">How do I get <em>onto</em> this path?</td>
                                <td className="py-2 pr-4 text-ink-body">Broadcast <code className="font-mono text-xs">commit(c, buyerSig, sellerSig)</code> yourself, then <code className="font-mono text-xs">resolveProcess</code>.</td>
                                <td className="py-2 text-ink-body"><code className="font-mono text-xs">settleBatch</code> is <strong>permissionless</strong> &mdash; anyone who can produce the SP1 proof may settle. In practice you <code className="font-mono text-xs">POST /submit</code> the same signed structs to a <strong>sequencer relay</strong> (below), which batches, proves and settles them.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Can I bond in a token I don&apos;t hold?</td>
                                <td className="py-2 pr-4 text-ink-body">Yes, in one transaction: <code className="font-mono text-xs">WitnessSwapAndCommitCoordinator.swapAndCommit</code> (below) swaps your input token at its immutable venue and then calls <code className="font-mono text-xs">commit</code>.</td>
                                <td className="py-2 text-ink-body">No pre-commit coordinator exists, and none can run in-batch &mdash; a batch operation is the signed commitment and nothing else. <strong>Swap in your wallet first</strong>, then submit; <code className="font-mono text-xs">settleBatch</code> pulls your <em>net</em> deposit by <code className="font-mono text-xs">transferFrom</code>, so approve the verifier, not the kernel.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Did both parties really sign it?</td>
                                <td className="py-2 pr-4 text-ink-body">The signature bytes live in the commit transaction&apos;s <strong>calldata</strong> &mdash; <code className="font-mono text-xs">OrderCommitted</code> carries the struct but no signatures. Decode, re-bind by order hash, re-verify.</td>
                                <td className="py-2 text-ink-body">The <strong>proof</strong> is the on-chain evidence that both recovered: <code className="font-mono text-xs">settleBatch</code>&apos;s calldata carries net positions, events and accruals &mdash; <em>no signature bytes</em>. Keep your own copy of the signed artifact.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Is this order settled?</td>
                                <td className="py-2 pr-4 font-mono text-xs">orderStatus(bytes32) == 2</td>
                                <td className="py-2 text-ink-body">No per-order flag exists on chain. The order&apos;s state lives under <code className="font-mono text-xs">stateRoot()</code>; the public facts are the batch that carried it and the transfers it executed.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">What event says so?</td>
                                <td className="py-2 pr-4 font-mono text-xs">OrderResolved · ProcessResolved</td>
                                <td className="py-2 font-mono text-xs">BatchSettled(uint64 batchId, bytes32 prevStateRoot, bytes32 newStateRoot, uint256 positionCount)</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Per-order evidence?</td>
                                <td className="py-2 pr-4"><code className="font-mono text-xs">Attestation</code> from <code>AttestationCoordinator</code></td>
                                <td className="py-2"><code className="font-mono text-xs">Attestation</code> re-emitted by the verifier &mdash; <strong>same topic hash</strong> (<code className="font-mono text-xs">0x754607f1…</code>), so filter by contract ADDRESS, not by topic &mdash; plus the ERC-20 transfers <code>settleBatch</code> executed for the net positions.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Did it count for RPGF?</td>
                                <td className="py-2 pr-4 font-mono text-xs">UsageCounter.accrualOf · UsageRecorded</td>
                                <td className="py-2 font-mono text-xs">UsageCounter.batchAccrualOf · BatchUsageRecorded</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Total usage score?</td>
                                <td className="py-2 pr-4" colSpan={2}><code className="font-mono text-xs">UsageCounter.scoreOf(clauseOrAssembly, period)</code> &mdash; sums BOTH paths&apos; scores. Read this, never <code className="font-mono text-xs">accrualOf</code> alone.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mt-4">
                    Read-path guidance for integrators, with the fold rule for the two usage streams, is in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a>; composition targets that read order state are on <Link href="/composes" className="underline">Composes</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="The sequencer: the batch path&rsquo;s entry point, and the only off-chain piece.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Everything else on this page is a contract. This one is not: a <strong>sequencer</strong> is an off-chain HTTP relay that pools signed operations, assembles a batch, proves it with SP1, and calls <code>settleBatch</code>. It is the ordinary way onto the batch path &mdash; not because the path is gated, but because producing a batch proof is the work it does for you.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>A relay, not an authority.</strong> <code>FigaroBatchVerifier.settleBatch</code> is <code>external</code> with no caller gate, no owner, no fee and no upgrade path &mdash; so a sequencer is one relay among any number, and running your own needs nobody&apos;s permission. It holds no keys of yours and confers no privilege: its own signer pays gas and has no protocol role. Its admission checks call the <em>same</em> kernel functions the proof runs (EIP-712 recovery; the attestation witness gates), so it can reject earlier than the proof and can never accept more. Its honest powers are exactly <strong>censor and delay</strong> &mdash; never forge, never alter a signed struct, never settle what you did not sign, never touch a bond. The fallback is always direct <code>FigaroCore</code> submission with the same artifacts.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Four endpoints and no other read surface, because settled state is read from the chain: <code>POST /submit</code> (a signed kernel operation &mdash; <code>Commit</code>, <code>Resolve</code>, <code>AttestAsSeller</code>, <code>AttestAsBuyer</code>), <code>POST /submit-usage</code> (the RPGF usage claim), <code>GET /health</code>, <code>GET /status</code>. Admission is idempotent on <em>on-chain identity</em>, so a re-signed duplicate still deduplicates. The wire format is exactly what <code>SequencerClient</code> (<code>@figaro/sdk/agent</code>) emits &mdash; the request/response and error tables, with the run-your-own recipe, are in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a>.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    No public sequencer endpoint is published yet; the address is deployment configuration, not a protocol constant, and no deployment-record key carries one. Source and environment table: <a href="https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md" target="_blank" rel="noopener noreferrer" className="underline"><code>prover/sequencer</code></a>.
                </p>
            </MarketingSection>

            <MarketingSection title="Token">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FlorinToken"
                        title="FlorinToken.sol"
                        href={`${GH}/florin/FlorinToken.sol`}
                        meta="ERC-20 + permit · 1B cap"
                        desc="ERC-20 + EIP-2612 permit. 1,000,000,000 MAX_SUPPLY hard cap on every mint. Minter registry with totalRegisteredCap. Deployer registers capped minters, then renounces."
                    />
                    <ContractEntry
                        id="IFlorinMinter"
                        title="IFlorinMinter.sol"
                        href={`${GH}/florin/IFlorinMinter.sol`}
                        desc="Single-method minter interface (mint(address, uint256)) implemented by FlorinToken. Anchors the minter-registry composition pattern."
                    />
                </ul>
                <p className="text-xs text-ink-muted mt-4">
                    Allocation: 70M founders + 30M supporters (genesis), 300M DAO (genesis), 600M RPGF to clause authors + assembly designers of record (RpgfMinter &mdash; registered at genesis; nine annual accrual periods, each paying pro rata from a UsageCounter period that has closed &mdash; nothing posted, bonded, or challenged). Schedule and formula: <Link href="/rpgf" className="underline">RPGF</Link>. See also <Link href="/papers/florin-schelling-point-token" className="underline">the florin</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Optional protocol contracts">
                <ul className="space-y-4">
                    <ContractEntry
                        id="MembersRegistry"
                        title="MembersRegistry.sol"
                        href={`${GH}/MembersRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless participant self-registration with reclaimable ETH deposit — one declaration document per wallet, whichever side of a trade it takes. Four functions (register, updateProfile, requestWithdrawal, withdraw): leaving de-lists you immediately, and the deposit is released after a cooldown, so a stake cannot be recycled through identity after identity. Availability is signal-by-availability off-chain, not registry state."
                    />
                    <ContractEntry
                        id="AssemblyRegistry"
                        title="AssemblyRegistry.sol"
                        href={`${GH}/AssemblyRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless assembly anchoring with reclaimable ETH deposit — the assembly registry's anchor, parallel to ClauseRegistry and MembersRegistry. Two functions (registerAssembly, withdrawDeposit); first-write-wins. Identity IS the composition: compositionHash = keccak256 of the template's canonical composition subset, so identical compositions collapse to one binding and the human slug is derived off-chain (deriveAssemblySlug). The binding is permanent — withdraw returns only the deposit and de-surfaces the assembly; no owner, no admin, no content validation."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Funding, payout &amp; composition contracts">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    The deployment record ships more than the kernel and the registries. These are the composed primitives around them &mdash; each an ordinary contract the kernel neither knows nor depends on. Where a canonical public deployment already exists (Uniswap&apos;s Permit2 and router, the ownerless Disperse), a local devnet rehearses the composition with an interface-matching mock, and the deployment record wires the real one wherever it&apos;s deployed.
                </p>
                <ul className="space-y-4">
                    <ContractEntry
                        id="WitnessSwapAndCommitCoordinator"
                        title="WitnessSwapAndCommitCoordinator.sol"
                        href={`${GH}/WitnessSwapAndCommitCoordinator.sol`}
                        meta="off-protocol · swap-and-commit"
                        desc="Off-protocol multi-token bond funding. A party (buyer or seller) holding a token the process isn't denominated in signs a Permit2 witness permit; the coordinator pulls that token, swaps it into the settlement currency, and commits in one transaction — the kernel still sees a single-currency commitment. It reads no kernel state and holds no bond; the kernel is untouched. DIRECT PATH ONLY: it calls FigaroCore.commit, and the batch path carries no funding leg — there, a party swaps in their own wallet before submitting the signed commitment to a sequencer (record key: witnessSwapAndCommitCoordinator)."
                    />
                    <ContractEntry
                        id="Permit2"
                        title="Permit2 (witness SignatureTransfer)"
                        meta="devnet mock · canonical where deployed"
                        desc="The permit layer the swap coordinator pulls the input token through — permitWitnessTransferFrom folds the authorized swap route into the digest the owner signed. The deployment record wires Uniswap's canonical Permit2 wherever it's deployed; a local devnet wires MockWitnessPermit2, whose digest parity with the canonical deployment is proven by the mainnet-fork suite (record key: permit2)."
                    />
                    <ContractEntry
                        id="swapRouter"
                        title="swapRouter (Uniswap Universal Router)"
                        meta="devnet mock · canonical where deployed"
                        desc="The swap venue the coordinator routes the input token through into the settlement currency. The deployment record wires the real Uniswap Universal Router wherever it's deployed; a local devnet wires MockUniversalRouter, pre-funded with bond-token liquidity and a settable rate (1:1 default) so buyer legs can swap deterministically in tests (record key: swapRouter)."
                    />
                    <ContractEntry
                        id="UsageCounter"
                        title="UsageCounter.sol"
                        href={`${GH}/protocol/usage/UsageCounter.sol`}
                        meta="permissionless · no owner"
                        desc="Verified clause and assembly usage, counted when it happens. recordClauseUsage proves from state the chain already holds that the order is RESOLVED (FigaroCore.orderStatus) and that the clause or assembly was merkle-committed in the signed agreementHash — the AttestationCoordinator leaf, byte for byte, with the status gate inverted. Anyone may call; the proof is what is trusted, never the caller. That status gate is DIRECT-PATH ONLY (see 'Two settlement paths' above), which is why the batch proof carries its own accrual into applyBatchAccrual, kept in a separate slot (batchAccrualOf) — read scoreOf(clauseOrAssembly, period), which sums BOTH paths' scores; accrualOf alone under-reports every clause or assembly whose trade moved to batches. Scores merge, components never do: the same seller may trade on both sides and the chain holds no seller SETS to union. Usage counts only for a LIVE-STAKED seller of record (MembersRegistry.registered gates every record, direct and batch), and a process counts once ever per clause or assembly. Accrual buckets into nine annual periods and a period's counts are final once it ends, so a consumer reads a number that can no longer move. Score = icbrt(c·d²·1e18) — UNIFORM, no tag/category/weight multiplier; d is the distinct live-staked sellers who carried the clause or assembly in that period (sellerSeen), weighted above volume; value is not a term. Below the minimum-support floor — minSellers distinct staked sellers, an immutable, 3 at the reference deployment — the score is zero: counting continues, and the full score springs when the third seller lands. Exists because the chain cannot look backwards: the kernel is frozen, never calls the registries, and no contract can read an event — so reconstructing usage afterwards is what forced the posting/bond/challenge/forum apparatus this replaces (record key: usageCounter)."
                    />
                    <ContractEntry
                        id="RpgfMinter"
                        title="RpgfMinter.sol"
                        href={`${GH}/rpgf/RpgfMinter.sol`}
                        meta="600M · no owner"
                        desc="The retroactive distribution: pays clause authors and assembly designers of record from a 600M-florin reserve, pro rata to real recorded usage. Nine annual accrual periods; the rising-budget schedule and the scoring formula are not re-derived here — see RPGF rewards. The claim unit is the PERIOD: claim(periodId, clausesOrAssemblies) pays from periodAmount[periodId] and requires that period closed, so a share is score-over-total against numbers that stopped moving — no snapshot, no checkpoint array, no history walk. This contract knows only periods and their budgets, and its budget array is validated against UsageCounter.periodCount() at deploy so the two schedules cannot drift. UNIFORM pro rata with no per-wallet cap; eligibility is a LIVE ETH stake — _isAuthor requires the clause's or assembly's registration deposit un-withdrawn, so you earn only while your stake stays live. One claim per wallet per period, every clause or assembly passed in that call (duplicate-free) and each verified against its own registry. No owner, no pause, no sweep, no claim expiry; the budget is bounded twice (minted[periodId] here, and the FlorinToken minter cap registered at genesis) (record key: rpgfMinter)."
                    />
                    <ContractEntry
                        id="daoTreasury"
                        title="daoTreasury (multisig)"
                        meta="devnet mock · genesis custody"
                        desc="Holds the 300M-florin DAO genesis allocation. A canonical deployment wires a Safe at the DAO wallet — config, never code; a local devnet wires MockTreasuryMultisig (2-of-3 anvil placeholders). The treasury never signs kernel commitments (the kernel is ECDSA-only); it buys through a per-procurement funded operator EOA (record key: daoTreasury)."
                    />
                    <ContractEntry
                        id="multisender"
                        title="multisender (Disperse)"
                        meta="devnet mock · canonical where deployed"
                        desc="Composed post-settlement batch dispersal — one payment, many recipients, one transaction; a wallet splits its own receipts to earmarked addresses. Post-settlement composition is path-blind: it acts on tokens already received, and both FigaroCore and FigaroBatchVerifier deliver by ERC-20 transfer to the party's own address. Wherever the canonical ownerless Disperse deployment (0xD152f549545093347A162Dce210e7293f1452150, the same address across chains, unowned since 2018) exists, the deployment record composes it directly; a local devnet wires MockDisperse mirroring its verified interface (record key: multisender)."
                    />
                </ul>
                <p className="text-sm text-ink-muted mt-4">
                    The RPGF reward&apos;s rising-budget schedule and its scoring formula are catalogued once, on <Link href="/rpgf" className="underline">RPGF</Link> &mdash; this page states the contract surface (functions, events, storage), not the schedule.
                </p>
            </MarketingSection>

            <MarketingSection title="Canonical deployments">
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Network</th>
                                <th scope="col" className="py-2 pr-4">Chain ID</th>
                                <th scope="col" className="py-2">Status</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default">
                            <tr><td className="py-2 pr-4">Local Anvil</td><td className="py-2 pr-4 font-mono">31337</td><td className="py-2 text-ink-muted">Devnet (active)</td></tr>
                            <tr><td className="py-2 pr-4">Ethereum mainnet</td><td className="py-2 pr-4 font-mono">1</td><td className="py-2 text-ink-muted">Pending external audit</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-ink-muted mt-4">
                    Per-network contract addresses ship in the deployment record the deploy script emits &mdash; <code>.deployments/local.json</code> for the local devnet. Each public network&apos;s addresses are published in this table; the record&apos;s key&nbsp;&rarr;&nbsp;SDK mapping is in the SDK README.
                </p>
                <p className="text-xs text-ink-muted mt-4">
                    Kernel surface is frozen for external audit. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="underline">RELEASE_READINESS.md</a>{" "}
                    for gate criteria, the frozen-surface declaration, and the hardening completion record.
                </p>
            </MarketingSection>

            <MarketingSection title="Composition">
                <p className="text-sm text-ink-body leading-relaxed">
                    Mechanisms, clauses, and role models extend the protocol without altering the kernel. The kernel invariants the Composition doctrine protects are catalogued on Protocol; the academic frame for why the kernel is narrow is on <Link href="/working-groups" className="underline">Papers</Link>. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/CLAUSES.md" target="_blank" rel="noopener noreferrer" className="underline">CLAUSES.md</a>{" "}
                    for the clause validation architecture and the anchoring doctrine, and the{" "}
                    <Link href="/builders" className="underline">Builders</Link> surface for composition tools. The external half &mdash; forums, offset markets, payout routing, and the rest of the compositional surface named above (<code>witnessSwapAndCommitCoordinator</code>, <code>multisender</code>, and the funding contracts) &mdash; is catalogued on <Link href="/composes" className="underline">Composes</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/kernel" className="text-ink-heading font-medium hover:underline">
                            Kernel
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage: coercion, cognition, crypto. What Figaro contributes to the third.</span>
                    </li>
                    <li>
                        <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">
                            Working groups
                        </Link>
                        <span className="text-ink-body"> &mdash; the eight discipline groups, each with what it asks of the substrate and the papers written from it.</span>
                    </li>
                    <li>
                        <Link href="/audit" className="text-ink-heading font-medium hover:underline">
                            Audit
                        </Link>
                        <span className="text-ink-body"> &mdash; the live verification surface: verify any deal yourself &mdash; a process&apos;s record and its hashes, readable by anyone, no wallet required.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
