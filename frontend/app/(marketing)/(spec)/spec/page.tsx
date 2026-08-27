import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Fragment } from "react";
import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { ContractEntry } from "@/components/shared/ContractEntry";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { SettlementPathsFigure } from "@/components/figures/SettlementPathsFigure";
import { SystemLayersFigure } from "@/components/figures/SystemLayersFigure";
import { OriginationSequenceFigure } from "@/components/figures/OriginationSequenceFigure";
import { GasCrossoverFigure } from "@/components/figures/GasCrossoverFigure";

export const metadata: Metadata = withOg({
    title: "Specifications — Figaro Protocol",
    description: "Canonical protocol surface: kernel, attestation coordinator, registries, token, optional protocol contracts — plus the sequencer, the batch path's one off-chain piece, the deployment-record-to-SDK field crosswalk, and every named revert an integrator can hit.",
});

const GH = "https://github.com/figaro-protocol/Figaro/blob/main/src";

/** The committed public deployment record, read at build time — the record is
 *  the canonical address source (`deployments/README.md`), never hand-typed
 *  constants. Absent record (a fork without the deploy) renders no row. */
function deploymentRecord(): Record<string, string | number> | null {
    try {
        return JSON.parse(fs.readFileSync(
            path.join(process.cwd(), "../deployments/11155111.json"), "utf-8"));
    } catch {
        return null;
    }
}

/** sha256 of the record's exact committed bytes, computed at build — DERIVED,
 *  never stored, so it cannot drift from the file (ruled 2026-08-25, the
 *  machine-discovery probe's ask). The security property is cross-origin:
 *  this site attests the bytes GitHub serves, so an agent hashes the raw
 *  file and compares one string — neither origin alone can forge agreement. */
function deploymentRecordSha256(): string | null {
    try {
        return createHash("sha256").update(fs.readFileSync(
            path.join(process.cwd(), "../deployments/11155111.json"))).digest("hex");
    } catch {
        return null;
    }
}

const JUMP_LINKS: { href: string; label: string }[] = [
    { href: "#inheritance", label: "Inheritance" },
    { href: "#install", label: "Install the SDK" },
    { href: "#kernel", label: "Kernel" },
    { href: "#attestation", label: "Attestation & clause" },
    { href: "#clause-validation", label: "Clause validation" },
    { href: "#settlement-paths", label: "Two settlement paths, two disjoint state universes" },
    { href: "#settlement-costs", label: "What each path costs" },
    { href: "#sequencer", label: "The sequencer" },
    { href: "#token", label: "Token" },
    { href: "#optional-contracts", label: "Optional protocol contracts" },
    { href: "#funding-composition", label: "Funding, payout & composition contracts" },
    { href: "#deployments", label: "Canonical deployments" },
    { href: "#errors", label: "Errors, by name" },
    { href: "#composition", label: "Composition" },
];

/** The named custom errors an INTEGRATOR can trigger by calling the contracts
 *  catalogued on this page, grouped by the lifecycle stage that throws them.
 *  Every row is transcribed from the Solidity revert site, never from memory;
 *  the boundary the section declares is enforced here — deploy-time constructor
 *  arguments and genesis wiring are deliberately absent. */
type ErrorRow = { name: string; from: string; cause: string; fix: string };
type ErrorStage = { stage: string; rows: ErrorRow[] };

const ERRORS: ErrorStage[] = [
    {
        stage: "Registering — a clause, an assembly, or a member profile",
        rows: [
            {
                name: "WrongDeposit(provided, required)",
                from: "ClauseRegistry · AssemblyRegistry",
                cause: "msg.value is not EXACTLY registrationDeposit(). Over-paying reverts too: there is no owner and no sweep, so excess ETH would be trapped forever.",
                fix: "Read registrationDeposit() live from the deployment you are calling and send exactly that. Never assume a number.",
            },
            {
                name: "InsufficientDeposit()",
                from: "MembersRegistry.register",
                cause: "The same exact-match check, despite the name — msg.value != registrationDeposit reverts, over-payment included.",
                fix: "Send exactly registrationDeposit().",
            },
            {
                name: "AlreadyRegistered(clauseId)",
                from: "ClauseRegistry.registerClause",
                cause: "That keccak256(abi.encode(clauseId, version)) is taken. First-write-wins and permanent — no overwrite, no re-registration of the same slot.",
                fix: "Check it BEFORE spending the deposit: computeClauseKey(id, version), then read registered(key). Pick another id or version if it is taken.",
            },
            {
                name: "AlreadyRegistered()",
                from: "MembersRegistry.register",
                cause: "This wallet already has a profile.",
                fix: "Call updateProfile(metadataURI) instead — no second deposit.",
            },
            {
                name: "CompositionAlreadyRegistered(compositionHash)",
                from: "AssemblyRegistry.registerAssembly",
                cause: "Identity IS the composition, so an identical composition is already anchored — even under someone else's name and prose.",
                fix: "Reuse the existing binding, or change something the hash covers. Renaming will not help: editorial prose is excluded from the hash.",
            },
            {
                name: "EmptyClauseId() · EmptyContentURI() · ZeroContentHash() · ZeroCompositionHash()",
                from: "ClauseRegistry · AssemblyRegistry",
                cause: "A required argument arrived empty or zero.",
                fix: "Pin the document first, then register with the real URI and canonicalContentHash(spec) / templateCompositionHash(template).",
            },
            {
                name: "NotRegistered() · NotRegistered(clauseId)",
                from: "All three registries",
                cause: "Reclaiming a deposit, reading a binding, or declaring a mechanism's clause (setMechanismClause) against a key that was never written.",
                fix: "Confirm the key first — registered(key), bindings(hash), or the registry's own event stream.",
            },
            {
                name: "NotRegisteredBy(caller, registeredBy)",
                from: "ClauseRegistry · AssemblyRegistry",
                cause: "Only the wallet that registered may reclaim that deposit. The error names the wallet that can.",
                fix: "Call from that wallet.",
            },
            {
                name: "AlreadyWithdrawn()",
                from: "ClauseRegistry · AssemblyRegistry",
                cause: "The deposit is already reclaimed. The binding itself stays anchored forever — withdrawal moves the stake and de-surfaces the entry, it never deletes it.",
                fix: "Nothing to do. Re-registering the same key is impossible by design.",
            },
            {
                name: "NothingPending() · CooldownActive(releaseAt)",
                from: "MembersRegistry.withdraw",
                cause: "Withdrawal is two steps: requestWithdrawal() then withdraw(), with a cooldown between them so a stake cannot be recycled through identity after identity.",
                fix: "Call requestWithdrawal() first; retry withdraw() once chain time passes releaseAt (which the revert hands you).",
            },
            {
                name: "TransferFailed()",
                from: "All three registries",
                cause: "The ETH refund to your address reverted — typically a contract wallet with no payable receive.",
                fix: "Register from an address that can accept ETH.",
            },
        ],
    },
    {
        stage: "Committing — FigaroCore.commit, and the settlement token underneath it",
        rows: [
            {
                name: "DeadlineExpired()",
                from: "FigaroCore.commit",
                cause: "c.deadline < block.timestamp at mining time — usually a deadline computed from the host clock, which can sit minutes off the chain's.",
                fix: "Build every deadline from CHAIN time: computeDeadline(await readChainTimestamp(publicClient)).",
            },
            {
                name: "ZeroPayment()",
                from: "FigaroCore.commit",
                cause: "payment == 0. A commitment with nothing staked has no equilibrium to protect, so the kernel refuses it outright.",
                fix: "Price the order. A non-market graph denominates in its own ERC-20 instead of committing zero.",
            },
            {
                name: "InvalidBuyerSignature() · InvalidSellerSignature()",
                from: "FigaroCore.commit",
                cause: "ECDSA recovery over the EIP-712 digest did not return c.buyer / c.seller. Almost always a domain or field-order mismatch rather than a wrong key.",
                fix: "Domain is { name: \"FigaroCore\", version: \"3\", chainId, verifyingContract: <core> }; the struct field order is canonical (COMMITMENT_TYPEHASH). Use buildDomain + buildCommitment, or check your hand-rolled type string against the exported COMMITMENT_TYPEHASH.",
            },
            {
                name: "InvalidRootCumulativeValue()",
                from: "FigaroCore.commit",
                cause: "A root order (processId == 0) whose expectedCumulativeValue is not equal to its payment.",
                fix: "For a root, the two are the same number — which is why the sub-order approval trap only bites later.",
            },
            {
                name: "ProcessAlreadyExists()",
                from: "FigaroCore.commit",
                cause: "The derived root id already names a process: the identical struct was signed and committed before.",
                fix: "Generate a fresh salt (generateSalt()) and re-sign.",
            },
            {
                name: "UnknownProcess()",
                from: "FigaroCore.commit · resolveProcess",
                cause: "A sub-order (or a resolve) naming a processId no root ever created.",
                fix: "Take the processId from the root's OrderCommitted event, not from your own derivation of a struct you have not committed yet.",
            },
            {
                name: "ProcessAlreadyResolved()",
                from: "FigaroCore.commit",
                cause: "Extending a process whose orders have all settled. Resolution is terminal — there is no reopening.",
                fix: "Commit a new process. Remedies are negotiated before resolve, never after.",
            },
            {
                name: "NotProcessBuyer()",
                from: "FigaroCore.commit · resolveProcess",
                cause: "On commit: the sub-order's buyer is not the process's root buyer. On resolve: msg.sender is not. One buyer binds the whole chain.",
                fix: "Every commitment in a process carries the same buyer, and only that wallet resolves.",
            },
            {
                name: "CurrencyMismatch()",
                from: "FigaroCore.commit",
                cause: "A sub-order denominated in a different ERC-20 than the process. The 2:1 bond ratio is a same-unit comparison; mixing would need an oracle.",
                fix: "One currency per process. Compose parallel processes, or swap wallet-side before committing.",
            },
            {
                name: "CumulativeValueMismatch(expected, actual)",
                from: "FigaroCore.commit",
                cause: "expectedCumulativeValue is not the process's running cumulative plus this order's payment — the revert names both numbers.",
                fix: "Re-read the chain before signing: reconstruct(events) gives the live cumulativeValue for the process.",
            },
            {
                name: "DuplicateCommitment()",
                from: "FigaroCore.commit",
                cause: "This exact order hash is already committed.",
                fix: "Fresh salt, re-sign, resubmit.",
            },
            {
                name: "FeeOnTransferDetected()",
                from: "FigaroCore.commit · FigaroBatchVerifier.settleBatch",
                cause: "The contract received a different amount than it pulled — a fee-on-transfer or rebasing ERC-20. The bond must stay exactly as committed for the equilibrium to hold.",
                fix: "Settle in a plain, non-rebasing ERC-20 (wstETH rather than stETH).",
            },
            {
                name: "ERC20InsufficientAllowance(spender, allowance, needed)",
                from: "the SETTLEMENT TOKEN — not the kernel",
                cause: "The kernel pulls the FULL per-order bond on every commit and nets nothing against bonds it already holds; approving the increment on a sub-order falls short. The kernel never sees the reason, and the earlier orders' bonds stay locked until the buyer resolves.",
                fix: "Size it with calculateSubOrderApproval(payment, newCumulativeValue) and pre-check with assertApprovalCoversBond, which throws in plain words before the transaction is sent.",
            },
            {
                name: "NothingToFund() · SwapCallFailed() · OutputBelowBond(received, required)",
                from: "WitnessSwapAndCommitCoordinator.swapAndCommit",
                cause: "No funding leg was enabled; or the venue call reverted; or the swap produced less than the bond it was meant to fund.",
                fix: "Enable at least one leg (DISABLED_SWAP_FUNDING_LEG for a self-funding party); widen slippage or maxInput; check the route encoded in the Permit2 witness matches the venue.",
            },
        ],
    },
    {
        stage: "Attesting — AttestationCoordinator, while the order is live",
        rows: [
            {
                name: "UnknownOrder()",
                from: "AttestationCoordinator (all three modes)",
                cause: "core.orderStatus(orderHash) is 0. Either the order never committed — or you passed the event-derived struct for a root, which signed processId = 0 and therefore hashes differently. It is also permanently true for a batch-settled order, which never acquires kernel status at all.",
                fix: "Pass the SIGNED struct (restoreSignedProcessId). If the trade settled through the batch path, there is no kernel order to attest against; the batch re-emits its own Attestation events.",
            },
            {
                name: "OrderResolved()",
                from: "AttestationCoordinator (all three modes)",
                cause: "orderStatus is 2. Evidence attaches to a LIVE order; settlement is terminal.",
                fix: "Attest before the buyer resolves.",
            },
            {
                name: "NotAuthorized()",
                from: "AttestationCoordinator (all three modes)",
                cause: "attestAsSeller from a caller that is not role.seller; attestAsBuyer from a caller that is not target.buyer; attestViaResolver when the seller contract's isAuthorized(orderHash, caller) returns false.",
                fix: "Pick the entry point that matches how your authority is provable — the three differ only in that.",
            },
            {
                name: "ProcessMismatch()",
                from: "AttestationCoordinator.attestAsSeller",
                cause: "The role and target commitments belong to different processes. Cross-order attestation stays inside one process.",
                fix: "For same-order attestation pass the SAME commitment struct in both slots.",
            },
            {
                name: "InvalidInclusionProof(agreementHash, clauseId)",
                from: "AttestationCoordinator (all three modes)",
                cause: "The merkle proof does not open the signed agreementHash to that clause's leaf — the clause was not in the agreement, or the proof was rebuilt from a different document than the one signed.",
                fix: "Rebuild from the agreement that was actually signed: buildSectionInclusionProof(agreement, section.clause), with sectionDataHash(section) as the section hash. clauseId is the bytes32 computeClauseKey, never the raw name.",
            },
        ],
    },
    {
        stage: "Resolving — FigaroCore.resolveProcess, buyer only, atomic",
        rows: [
            {
                name: "NoActiveOrders() · IncompleteOrderList(required, provided)",
                from: "FigaroCore.resolveProcess",
                cause: "Resolution is atomic: the call must carry EVERY active order's commitment, exactly activeOrderCount of them. Partial resolution does not exist.",
                fix: "Rebuild the full set from OrderCommitted events (the event carries every struct field) — nothing has to be stored client-side.",
            },
            {
                name: "OrderNotCommitted(orderHash)",
                from: "FigaroCore.resolveProcess",
                cause: "A struct in the array re-hashes to an order the kernel does not hold. The silent cause is the dual-processId trap: the ARGUMENT is the derived process id, but a root struct must carry the processId = 0 it was signed with.",
                fix: "Pass every struct through restoreSignedProcessId, or use executeAction, which applies it for you. The lower-level resolveProcess wrapper and hand-rolled cast do not.",
            },
        ],
    },
    {
        stage: "Recording usage and claiming RPGF — UsageCounter, RpgfMinter",
        rows: [
            {
                name: "AccrualClosed()",
                from: "UsageCounter.currentPeriod, called first by both record functions",
                cause: "The last accrual period has ended; usage is permanently unrecordable after it. currentPeriod() is a view that reverts — the revert IS the answer.",
                fix: "Wrap the read; check periodClosed(uint8), periodCount() and periodEnd(uint256) before trusting a run. Note recordProcessUsage tolerates per-leg reverts, so this does not throw: it returns a report with every leg in failures.",
            },
            {
                name: "UnknownOrder() · OrderNotResolved()",
                from: "UsageCounter.recordClauseUsage · recordAssemblyUsage",
                cause: "The counter proves settlement from FigaroCore.orderStatus and requires 2 (RESOLVED). Usage is what a finished process leaves behind.",
                fix: "Record at settlement, in the same breath as the resolve. This gate is direct-path only — batch trade reaches the counter through applyBatchAccrual instead.",
            },
            {
                name: "InvalidInclusionProof()",
                from: "UsageCounter.recordClauseUsage · recordAssemblyUsage",
                cause: "Same leaf shape as the attestation coordinator's, byte for byte — the proof must open the signed agreementHash.",
                fix: "Same builder: buildSectionInclusionProof over the agreement that was signed.",
            },
            {
                name: "ClauseOrAssemblyExcluded(clauseOrAssembly)",
                from: "UsageCounter",
                cause: "That key is in the counter's excluded set. Of the three mandatory clauses, commerce and topology EARN — they ride on every order and are scored for their author of record. The reference deployments exclude exactly one key, figaro-assembly-provenance: it is attribution plumbing, and scoring it would double-pay every assembly trade (its designer accrues through recordAssemblyUsage instead). ROUTINE where it appears, not a fault.",
                fix: "Nothing. The set is a constructor argument, so read excludedClauseOrAssembly(key) against the deployment you are calling rather than assuming a list; expect the provenance leg in failures on any assembly run.",
            },
            {
                name: "ClauseOrAssemblyNotRegistered(clauseOrAssembly)",
                from: "UsageCounter",
                cause: "The author-side stake is not live: the registration deposit was withdrawn, or the key was never registered. Authorship earns only while the stake stays live.",
                fix: "Nothing the recorder can do — this is the author's stake, not the caller's.",
            },
            {
                name: "SellerNotStaked(seller)",
                from: "UsageCounter",
                cause: "The order's seller of record has no live MembersRegistry stake. Both sides of the gate are live stakes.",
                fix: "Record before a seller unstakes — another reason recording belongs at settlement.",
            },
            {
                name: "AlreadyCounted()",
                from: "UsageCounter",
                cause: "One process counts once, ever, per clause or assembly.",
                fix: "Nothing. A repeat call is a no-op you can ignore.",
            },
            {
                name: "NotBatchVerifier()",
                from: "UsageCounter.applyBatchAccrual",
                cause: "Only the configured FigaroBatchVerifier may push a proved accrual across the settlement seam.",
                fix: "Not an integrator call. Direct-path recording goes through recordClauseUsage / recordAssemblyUsage.",
            },
            {
                name: "UnknownPeriod(periodId) · PeriodStillAccruing(periodId)",
                from: "RpgfMinter.claim",
                cause: "periodId is beyond periodCount(), or that period has not closed. The claim unit is the CLOSED period, so a share is score-over-total against numbers that stopped moving.",
                fix: "Claim after UsageCounter.periodClosed(periodId) is true.",
            },
            {
                name: "AlreadyClaimed(periodId, account)",
                from: "RpgfMinter.claim",
                cause: "One claim per wallet per period.",
                fix: "Pass every clause and assembly you author in that single call.",
            },
            {
                name: "NotAuthorOfRecord(clauseOrAssembly, caller)",
                from: "RpgfMinter.claim",
                cause: "The caller is not the registrant of that key — or was, but withdrew the registration deposit. Eligibility is a live ETH stake.",
                fix: "Claim from the registering wallet, with its deposit un-withdrawn.",
            },
            {
                name: "DuplicateClauseOrAssembly(key) · NoClausesOrAssemblies() · NothingToClaim()",
                from: "RpgfMinter.claim",
                cause: "The array repeated a key, was empty, or produced a zero amount (no recorded score in that period).",
                fix: "De-duplicate the array; check scoreOf(key, period) before claiming.",
            },
            {
                name: "PeriodBudgetExceeded(periodId)",
                from: "RpgfMinter.claim",
                cause: "The period's budget is bounded and would be overspent by this claim.",
                fix: "Nothing to retry — the bound is the mechanism's, not a rate limit.",
            },
        ],
    },
    {
        stage: "Settling a batch — FigaroBatchVerifier.settleBatch (sequencer-side)",
        rows: [
            {
                name: "StateRootMismatch(expected, actual) · ChainIdMismatch · VerifyingContractMismatch",
                from: "FigaroBatchVerifier.settleBatch",
                cause: "The proof's public values do not describe this chain, this verifier, or the current state root — usually a batch proved against a root another batch has since advanced past.",
                fix: "Re-read stateRoot() and re-prove. Batches settle in sequence.",
            },
            {
                name: "PositionHashMismatch() · AttestationHashMismatch() · SpecBindingsHashMismatch() · UsageAccrualHashMismatch()",
                from: "FigaroBatchVerifier.settleBatch",
                cause: "The calldata arrays do not hash to what the proof committed to — the proof and the data submitted alongside it disagree.",
                fix: "Emit both from the same prover run; never re-serialize one of them independently.",
            },
            {
                name: "SpecBindingMismatch(clauseId, anchored, proven)",
                from: "FigaroBatchVerifier.settleBatch",
                cause: "The clause spec supplied to the proof as a witness does not hash to the contentHash ClauseRegistry anchors for that clause. This IS the in-proof content check's binding.",
                fix: "Feed the prover the exact canonical bytes that were pinned and registered — the revert names both hashes.",
            },
        ],
    },
];

export default function Specifications() {
    const record = deploymentRecord();
    const recordSha = deploymentRecordSha256();
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

            <MarketingSection sectionId="jump-index">
                <nav aria-label="Sections on this page">
                    <ol className="space-y-2 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                        {JUMP_LINKS.map((l) => (
                            <li key={l.href}>
                                <Link href={l.href} className="text-ink-heading font-medium hover:underline">
                                    {l.label}
                                </Link>
                            </li>
                        ))}
                    </ol>
                </nav>
            </MarketingSection>

            <MarketingSection title="Inheritance" sectionId="inheritance">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    This page catalogues the <strong>on-chain composition</strong> layer (the kernel plus the permissionless primitives built around it). Each contract below inherits the kernel&apos;s ownerless / tamper-evident / atomic-settlement properties &mdash; the invariants stated on <Link href="/kernel" className="underline">Kernel</Link>. The kernel in turn inherits execution security from whichever EVM chain it is deployed on &mdash; network → kernel → on-chain composition → off-chain composition → trade. Remove any floor and what&apos;s above collapses.
                </p>
                <SystemLayersFigure className="my-8" />
                <p className="text-sm text-ink-muted">
                    Off-chain composition lives on the Clauses and Assemblies surfaces (linked below).
                </p>
            </MarketingSection>

            <MarketingSection title="Install the SDK" sectionId="install">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <code>@figaro-protocol/sdk</code> is the TypeScript client for everything on this page &mdash; event parsing, state reconstruction, EIP-712 commitment building, bond math, agent coordination, checkout planning &mdash; over <code>viem</code>, a peer dependency:
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>npm install @figaro-protocol/sdk viem</code>
                </pre>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>Starting from zero?</strong> Start with <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md#your-first-commit" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium underline">Your first commit</a>, the SDK README&apos;s opening walkthrough &mdash; a cold machine to a bonded order committed on chain and read back from its events, every step a command you run yourself. The catalogue below is the reference you come back to once something is running.
                </p>
                <OriginationSequenceFigure className="my-8" />
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <a href="/sdk-api/index.html" className="text-ink-heading font-medium underline">Generated API reference &mdash; every export, every signature</a>. TypeDoc rendered from the shipped source, one page per entry point: the root package, <code>/agent</code>, <code>/derive</code>, <code>/clauses</code>, <code>/handoff</code> and <code>/signer</code>. This is where you look a signature up; the README below is the manual you read first.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">
                    Every published version carries an npm <em>provenance attestation</em> binding the tarball to the public repository and the exact release commit &mdash; verify it with <code>npm audit signatures</code>, or on the package&apos;s Provenance panel on npmjs.com. What you install is what the published tree builds, checkably.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a> in the public repo is the canonical integration manual &mdash; recipes, traps, and the six entry points (<code>@figaro-protocol/sdk</code> plus <code>/agent</code>, <code>/derive</code>, <code>/clauses</code>, <code>/handoff</code>, <code>/signer</code>), not duplicated here. The canonical clause specs are readable without a browser too: <a href="https://github.com/figaro-protocol/Figaro/tree/main/clauses" target="_blank" rel="noopener noreferrer" className="underline"><code>clauses/*.json</code></a> in the public repo is the <code>ClauseRegistry</code> seed data, loaded from <code>ClauseRegistry</code> &rarr; IPFS at runtime.
                </p>
            </MarketingSection>

            <MarketingSection title="Kernel" sectionId="kernel">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FigaroCore"
                        title="FigaroCore.sol"
                        href={`${GH}/kernel/FigaroCore.sol`}
                        meta="2 fns · 3 mappings · no owner"
                        desc="The protocol kernel: holds every bonded commitment, and settles a process atomically when its buyer resolves. commit (unified dual-signed) and resolveProcess. EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution. Settlement state is the public mapping orderStatus(bytes32 orderHash) → uint8: 0 UNKNOWN, 1 ACTIVE, 2 RESOLVED. It answers for the DIRECT path only — a process settled through FigaroBatchVerifier (below) is never written here and reads 0 forever, so 0 means 'not on this path', never 'not settled'. See 'Two settlement paths' below."
                    />
                    <ContractEntry
                        id="CommitmentTypes"
                        title="CommitmentTypes.sol"
                        href={`${GH}/kernel/CommitmentTypes.sol`}
                        desc="EIP-712 typed structs and hash functions. Single Commitment struct for root and sub-orders; processId zero for root."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Attestation &amp; clause" sectionId="attestation">
                <ul className="space-y-4">
                    <ContractEntry
                        id="AttestationCoordinator"
                        title="AttestationCoordinator.sol"
                        href={`${GH}/protocol/coordinators/AttestationCoordinator.sol`}
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
                        href={`${GH}/protocol/registries/ClauseRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only clause anchoring, first-write-wins. clauseId is the bare human-readable name; the on-chain identity/dedup key is keccak256(abi.encode(clauseId, version)), so name+version together form the key. contentURI points at the off-chain JSON spec, and the registry stores its keccak256 contentHash as the integrity anchor the batch verifier binds witness specs to (contentHashOf). The registry validates no content shape itself — a registered clause is immediately attestable, and settleable through the proven path. One extra entry point sits beside registration: setMechanismClause(idHash) is permissionless self-declaration for a composed mechanism contract — it writes no storage and confers nothing, it just emits MechanismClauseSet(msg.sender, idHash) so indexers can see which clause your mechanism speaks, and it reverts NotRegistered(idHash) if that clause was never anchored. Pass the identity HASH (computeClauseKey(id, version)), not the bare name registerClause takes."
                    />
                    <ContractEntry
                        id="FigaroBatchVerifier"
                        title="FigaroBatchVerifier.sol"
                        href={`${GH}/protocol/verifier/FigaroBatchVerifier.sol`}
                        meta="SP1 proof · open-world content check"
                        desc="Batched settlement via a single SP1 validity proof. A generic in-proof engine validates each clause's content against its spec (supplied as a witness); settleBatch accepts the batch only if every (clauseId → witness-spec hash) binding equals ClauseRegistry.contentHashOf(clauseId), then reconciles net token positions and re-emits attestation events. The program verification key covers the engine, not a clause list — a never-seen clause settles with zero code changes. It shares NO state with FigaroCore and never calls it: this path replaces the whole commit-plus-resolveProcess lifecycle, so a batch-settled process writes no kernel orderStatus and emits no kernel event. Its own state is stateRoot() (bytes32) plus batchCount() (uint64), advanced per BatchSettled. No owner, no fee, no upgrade. A local development record wires MockSP1Verifier; the deployment record wires Succinct's SP1 gateway + program vkey from env wherever a network names one."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Clause validation" sectionId="clause-validation">
                <p className="text-base text-ink-body leading-relaxed">
                    Clause content is validated <strong>off-chain</strong> (the Layer-A TypeScript SDK) before signing, and re-validated <strong>on-chain</strong> on the batched, proof-based settlement path &mdash; a generic SP1 engine checks each clause against its registry-anchored spec, so a never-seen clause settles with zero per-clause on-chain code. The direct attestation path merkle-binds but validates no content shape. <code>figaro-topology</code> is agreement-only &mdash; committed at signing, with no runtime attestation. The full inventory &mdash; every clauseId and what it carries &mdash; is on <Link href="/clauses" className="underline">Clauses</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Two settlement paths, two disjoint state universes." sectionId="settlement-paths">
                <SettlementPathsFigure className="mb-6" />
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> share no state and never call each other. The batch path replaces the entire direct lifecycle &mdash; <code>commit</code> and <code>resolveProcess</code> both execute inside the proof &mdash; so <strong>a batch-settled process never acquires kernel status</strong>: <code>core.orderStatus(orderHash)</code> returns <code>0</code> for it, permanently. The converse holds too: a kernel-settled process is never inside a batch. There is no migration between the two, and none is planned; the split is the design.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>The consequence for anything you build: a gate on <code>orderStatus</code> cannot see batched trade.</strong> Not &ldquo;sees it late&rdquo; &mdash; cannot see it at all. That is already true inside the protocol: <code>AttestationCoordinator</code> requires an ACTIVE order and <code>UsageCounter.recordClauseUsage</code> requires a RESOLVED one, and a batch-settled process satisfies neither, forever &mdash; which is exactly why the batch proof carries the RPGF usage accrual across itself, as proved numbers, into <code>UsageCounter.applyBatchAccrual</code>. That accrual is the <em>only</em> thing that crosses. No status, no process record, no attestation state. This is the sharpest read-time trap in the protocol and it fails silently &mdash; it is catalogued as such, with the rest, on <Link href="/pitfalls" className="underline">Sharp edges</Link>.
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
                                <td className="py-2 text-ink-body">No per-order flag exists on chain &mdash; the order&apos;s state lives under <code className="font-mono text-xs">stateRoot()</code>, and the on-chain facts are the batch that carried it and the transfers it executed. Ask a relay for the per-order answer: <code className="font-mono text-xs">GET /processes/&lt;processId&gt;</code> (or <code className="font-mono text-xs">/orders/&lt;orderHash&gt;</code>), which <code className="font-mono text-xs">SequencerClient.process()</code> wraps. A <code className="font-mono text-xs">null</code> there means &ldquo;not in THIS relay&apos;s archive&rdquo; &mdash; never &ldquo;not settled.&rdquo; The relay is transport; the transfers are the proof.</td>
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
                    Read-path guidance for integrators, with the fold rule for the two usage streams, is in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a>; composition targets that read order state are on <Link href="/composition" className="underline">Composition</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What each path costs &mdash; and when the direct path is simply correct." sectionId="settlement-costs">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Two costs, and neither falls where a platform&apos;s would. Proving is the <strong>relay operator&apos;s</strong> (a sequencer, below), paid once per batch and never once per order &mdash; no protocol fee passes it through to a buyer or a seller. Gas on <code>settleBatch</code> is paid by whoever submits it. The <em>direct</em> path carries neither: no prover, no relay, no proving host at all. Which of the two is cheaper for you is a volume question, and the numbers below are what it turns on.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>What the proof costs to verify on chain.</strong> Per-unit, from the measured ceilings: SP1 proof verification is a <strong>~300k-gas FIXED cost per batch</strong>, then ~2k/position for hash verification and ~24k/position for the net token transfer &mdash; <strong>~26.5k marginal per net position</strong>. The direct path&apos;s comparable all-in figure is <strong>~167k gas per order</strong>, its <code>commit</code> and <code>resolveProcess</code> steps added together across the two or more separate transactions they occupy &mdash; those per-step constants, and the two process ceilings they set, are stated on <Link href="/faq#compatibility" className="underline">the FAQ</Link> and not restated here. At volume that is roughly <strong>6&times; cheaper per settled order</strong>, before netting &mdash; and netting is the structural part: the prover collapses every movement per (token, party) pair into one position, so 100 buyers paying one seller in one token is 100 commit transactions on the direct path and <em>one</em> position on the batch path. Worked at 100 orders: ~25.7M gas across 100+ transactions direct, against ~1.1M gas in a single transaction for the ~30 net positions they reduce to.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>But fixed means fixed, and a small batch pays it anyway.</strong> Two real Groth16 batches settled on the public record&apos;s chain &mdash; through the <code>batchVerifier</code> in the record below &mdash; each carried <strong>2 net positions</strong> and cost:
                </p>
                <div className="overflow-x-auto -mx-6 px-6 mb-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Settlement transaction</th>
                                <th scope="col" className="py-2 pr-4">What it carried</th>
                                <th scope="col" className="py-2 pr-4">Net positions</th>
                                <th scope="col" className="py-2">Gas used</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default">
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs"><a href="https://sepolia.etherscan.io/tx/0xa17cbb347f4a13893649d4f108a5681a3b652a04cedf2579706b0117fff69bf2" target="_blank" rel="noopener noreferrer" className="underline">0xa17cbb34&hellip;f69bf2</a></td>
                                <td className="py-2 pr-4 text-ink-body">commit + witness attestation</td>
                                <td className="py-2 pr-4 font-mono">2</td>
                                <td className="py-2 font-mono">385,902</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs"><a href="https://sepolia.etherscan.io/tx/0x2f81831d449ce6f90bb15bb54abaf7a32c3473c120e6cc9c9e35e0518e795928" target="_blank" rel="noopener noreferrer" className="underline">0x2f81831d&hellip;795928</a></td>
                                <td className="py-2 pr-4 text-ink-body">resolve + RPGF usage claim</td>
                                <td className="py-2 pr-4 font-mono">2</td>
                                <td className="py-2 font-mono">377,885</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Divide those out and a two-position batch runs ~190k gas per position &mdash; <em>above</em> the direct path&apos;s ~167k per order, because two positions are carrying the whole ~300k proof verification between them. The same ~300k is what a thousand-position batch pays. <strong>Which puts the crossover at about three net positions:</strong> back the ~26.5k marginal out of the 385,902 measured above and ~333k of that transaction was fixed proof verification, so per position the batch costs ~193k at two and ~137k at three &mdash; the third net position is where it passes under the direct path&apos;s ~167k. Three <em>positions</em>, not three orders: netting is what turns many orders into few positions, so a real batch usually clears that line well before its order count suggests. <strong>So the batch path is an amortization, not a discount:</strong> it wins where the fixed cost divides by a large number and where netting collapses many orders into few positions, and it loses below that. Read those receipts yourself before you plan around either figure &mdash; both are public, both are linked above.
                </p>
                <GasCrossoverFigure className="my-8" />
                <p className="text-base text-ink-body leading-relaxed">
                    <strong>When the direct path is simply correct: low volume.</strong> At a handful of orders a day it costs less per order <em>and</em> costs nothing else &mdash; no proving host, no relay to operate or trust, no vkey/gateway pairing to keep aligned, no minutes of wrap between signing and settlement, and settlement state you can read straight off <code>FigaroCore.orderStatus</code>. Nothing is lost by starting there: both paths take the <em>same signed artifacts</em>, so moving to batches later is a change of submission target, not a change to what you sign. The batch path is what you reach for when your own volume, not the protocol, makes the proof pay.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed mt-4">
                    Per-unit gas figures and the netting model: <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/SCALING_STRATEGY.md" target="_blank" rel="noopener noreferrer" className="underline">SCALING_STRATEGY.md</a> &sect; Gas Economics (measured on Anvil receipts; the direct-path pair <code>COMMIT_GAS_PER_ORDER</code>/<code>RESOLVE_GAS_PER_ORDER</code> is lint-pinned against the kernel&apos;s own gas test). The two settlement transactions are read from the chain, not restated.
                </p>
            </MarketingSection>

            <MarketingSection title="The sequencer: the batch path&rsquo;s entry point, and the only off-chain piece." sectionId="sequencer">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Everything else on this page is a contract. This one is not: a <strong>sequencer</strong> is an off-chain HTTP relay that pools signed operations, assembles a batch, proves it with SP1, and calls <code>settleBatch</code>. It is the ordinary way onto the batch path &mdash; not because the path is gated, but because producing a batch proof is the work it does for you.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>A relay, not an authority.</strong> <code>FigaroBatchVerifier.settleBatch</code> is <code>external</code> with no caller gate, no owner, no fee and no upgrade path &mdash; so a sequencer is one relay among any number, and running your own needs nobody&apos;s permission. It holds no keys of yours and confers no privilege: its own signer pays gas and has no protocol role. Its admission checks call the <em>same</em> kernel functions the proof runs (EIP-712 recovery; the attestation witness gates), so it can reject earlier than the proof and can never accept more. Its honest powers are exactly <strong>censor and delay</strong> &mdash; never forge, never alter a signed struct, never settle what you did not sign, never touch a bond. The fallback is always direct <code>FigaroCore</code> submission with the same artifacts.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Seven endpoints, in two halves. <strong>Submission:</strong> <code>POST /submit</code> (a signed kernel operation &mdash; <code>Commit</code>, <code>Resolve</code>, <code>AttestAsSeller</code>, <code>AttestAsBuyer</code>), <code>POST /submit-usage</code> (the RPGF usage claim), <code>GET /health</code>, <code>GET /status</code>. Admission is idempotent on <em>on-chain identity</em>, so a re-signed duplicate still deduplicates. <strong>Publication</strong> &mdash; the batch universe&apos;s mirror of the kernel&apos;s events, because a batch-settled order has none: <code>GET /orders/&lt;orderHash&gt;</code>, <code>GET /processes/&lt;processId&gt;</code>, <code>GET /batches</code> (a page bounded at 50, with a <code>next_cursor</code> to follow). Read those through <code>SequencerClient</code>&apos;s <code>order()</code>, <code>process()</code> and <code>batches()</code> rather than by hand, for the <code>404</code> rule they encode: <strong>null means &ldquo;not in THIS relay&apos;s archive&rdquo;</strong> &mdash; settled by another relay, settled directly against <code>FigaroCore</code>, or aged out of retention (<code>status().archive</code> gives the window) &mdash; and never &ldquo;the trade did not happen.&rdquo; Every other failure throws, so an unreachable relay stays distinguishable from an absent record. A relay is transport, not an authority: verify what it returns against the chain. The wire format is exactly what <code>SequencerClient</code> (<code>@figaro-protocol/sdk/agent</code>) emits &mdash; endpoint-by-endpoint request/response shapes and the status-code table are in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md#the-sequencer-wire-seven-endpoints" target="_blank" rel="noopener noreferrer" className="underline">SDK README</a>, and the run-your-own recipe is in <a href="https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md" target="_blank" rel="noopener noreferrer" className="underline"><code>prover/sequencer</code></a>.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    A sequencer endpoint is deployment configuration, not a protocol constant, and no deployment-record key carries one. Source and environment table: <a href="https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md" target="_blank" rel="noopener noreferrer" className="underline"><code>prover/sequencer</code></a>.
                </p>

                <h3 className="text-heading-h3 text-ink-heading mt-10 mb-4">
                    Running one yourself: what to check before you budget a host.
                </h3>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>A laptop is not a proving host.</strong> Succinct&apos;s stated Groth16 wrap floor is <strong>~14&nbsp;GB RAM</strong> (through the <code>sp1-gnark</code> image), and the rehearsal that settled the two batches priced above measured <strong>~18&nbsp;GB peak and ~6&ndash;7 minutes per wrap</strong> on a rented 16-core / 30&nbsp;GB host at <code>SP1_PROVER=cpu</code> &mdash; with swap, because the wrap was OOM-killed at 18&nbsp;GB on 30&nbsp;GB without it. That is <em>one machine&apos;s</em> number, not a protocol constant: proof time, memory and proof size all move with your hardware, your batch size, and whether the secp256k1 precompile patch is active. <strong>Measure your own before you budget one</strong> &mdash; <code>SP1_REAL_PROOF=1 cargo run -p figaro-prove-test --release</code> from <code>prover/</code> proves the canonical batch on your machine and prints its cycle count, generation time and proof size. An operator with no hardware sets <code>SP1_PROVER=network</code> and buys the proof from the Succinct Prover Network instead; that is still the operator&apos;s cost, never the protocol&apos;s or its users&apos;.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Two operational gates decide whether a proof settles at all, and both fail loudly but late: the guest ELF&apos;s verification key must equal the deployed <code>FigaroBatchVerifier.programVKey()</code> or every proof reverts <code>ProofInvalid()</code>, and the proof FORM must match the form the deployed SP1 gateway routes (<code>groth16</code> or <code>plonk</code>) or it reverts <code>RouteNotFound</code>. Check both <em>before</em> a seven-minute wrap, not after. Batching cadence is yours: the reference sequencer assembles on a tick (10&nbsp;s by default) up to a batch cap (100 operations by default), so the wrap time &mdash; minutes &mdash; is what actually sets time-to-settle, not the tick.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed mt-4">
                    Proving-host sizing and the first run&apos;s lessons: <a href="https://github.com/figaro-protocol/Figaro/blob/main/scripts/prover-box/README.md" target="_blank" rel="noopener noreferrer" className="underline"><code>scripts/prover-box</code></a>. Proving-cost posture and the benchmark command: <a href="https://github.com/figaro-protocol/Figaro/blob/main/prover/sequencer/README.md" target="_blank" rel="noopener noreferrer" className="underline"><code>prover/sequencer</code></a>.
                </p>
            </MarketingSection>

            <MarketingSection title="Token" sectionId="token">
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

            <MarketingSection title="Optional protocol contracts" sectionId="optional-contracts">
                <ul className="space-y-4">
                    <ContractEntry
                        id="MembersRegistry"
                        title="MembersRegistry.sol"
                        href={`${GH}/protocol/registries/MembersRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless participant self-registration with reclaimable ETH deposit — one declaration document per wallet, whichever side of a trade it takes. Four functions (register, updateProfile, requestWithdrawal, withdraw): leaving de-lists you immediately, and the deposit is released after a cooldown, so a stake cannot be recycled through identity after identity. Availability is signal-by-availability off-chain, not registry state."
                    />
                    <ContractEntry
                        id="AssemblyRegistry"
                        title="AssemblyRegistry.sol"
                        href={`${GH}/protocol/registries/AssemblyRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless assembly anchoring with reclaimable ETH deposit — the assembly registry's anchor, parallel to ClauseRegistry and MembersRegistry. Two functions (registerAssembly, withdrawDeposit); first-write-wins. Identity IS the composition: compositionHash = keccak256 of the template's canonical composition subset, so identical compositions collapse to one binding and the human slug is derived off-chain (deriveAssemblySlug). The binding is permanent — withdraw returns only the deposit and de-surfaces the assembly; no owner, no admin, no content validation."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Funding, payout &amp; composition contracts" sectionId="funding-composition">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    The deployment record ships more than the kernel and the registries. These are the composed primitives around them &mdash; each an ordinary contract the kernel neither knows nor depends on. Where a canonical public deployment already exists (Uniswap&apos;s Permit2 and router, the ownerless Disperse), a local development run rehearses the composition with an interface-matching mock, and the deployment record wires the real one wherever it&apos;s deployed.
                </p>
                <ul className="space-y-4">
                    <ContractEntry
                        id="WitnessSwapAndCommitCoordinator"
                        title="WitnessSwapAndCommitCoordinator.sol"
                        href={`${GH}/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol`}
                        meta="off-protocol · swap-and-commit"
                        desc="Off-protocol multi-token bond funding. A party (buyer or seller) holding a token the process isn't denominated in signs a Permit2 witness permit; the coordinator pulls that token, swaps it into the settlement currency, and commits in one transaction — the kernel still sees a single-currency commitment. It reads no kernel state and holds no bond; the kernel is untouched. DIRECT PATH ONLY: it calls FigaroCore.commit, and the batch path carries no funding leg — there, a party swaps in their own wallet before submitting the signed commitment to a sequencer (record key: witnessSwapAndCommitCoordinator)."
                    />
                    <ContractEntry
                        id="Permit2"
                        title="Permit2 (witness SignatureTransfer)"
                        meta="local mock · canonical where deployed"
                        desc="The permit layer the swap coordinator pulls the input token through — permitWitnessTransferFrom folds the authorized swap route into the digest the owner signed. The deployment record wires Uniswap's canonical Permit2 wherever it's deployed; a local development record wires MockWitnessPermit2, whose digest parity with the canonical deployment is proven by the fork suite (record key: permit2)."
                    />
                    <ContractEntry
                        id="swapRouter"
                        title="swapRouter (Uniswap SwapRouter02)"
                        meta="local mock · canonical where deployed"
                        desc="The swap venue the coordinator routes the input token through into the settlement currency. It is SwapRouter02, not the Universal Router, and the difference is load-bearing for the calldata you sign: the coordinator approves the router for your input token and forwards your signed swapData verbatim, so the venue must PULL by ERC-20 allowance — SwapRouter02's exactOutputSingle does (an exact output, the bond, for at most amountInMaximum of input); the Universal Router pulls through Permit2 or spends pre-sent balances and would not. Build that calldata with the SDK's SWAP_ROUTER_02_ABI export — it carries exactly the venue shapes the protocol composes (exactOutputSingle plus the factory() probe), so what you encode is what the coordinator's allowance can satisfy. The deploy script proves the address behaves like one before broadcasting — factory() and WETH9() must both answer with contracts — and a local development record wires the settable-rate stand-in MockSwapVenue, pre-funded with bond-token liquidity at a 1:1 default so buyer legs swap deterministically in tests (record key: swapRouter)."
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
                        meta="multisig · genesis custody"
                        desc="Holds the 300M-florin DAO genesis allocation. Three cases, and they differ: a production deploy mints to a canonical Safe read from the DAO_WALLET environment variable and deploys no treasury contract at all — config, never code. The public record above does deploy one: a MockTreasuryMultisig, 2-of-3 over the founder wallet, the supporters wallet and the deploying wallet — real signers on a real network, not placeholders, and a plain multisig rather than a Safe. A local development record deploys the same contract over that run's own anvil accounts. In every case the treasury never signs kernel commitments (the kernel is ECDSA-only); it buys through a per-procurement funded operator EOA (record key: daoTreasury)."
                    />
                    <ContractEntry
                        id="multisender"
                        title="multisender (Disperse)"
                        meta="local mock · canonical where deployed"
                        desc="Composed post-settlement batch dispersal — one payment, many recipients, one transaction; a wallet splits its own receipts to earmarked addresses. Post-settlement composition is path-blind: it acts on tokens already received, and both FigaroCore and FigaroBatchVerifier deliver by ERC-20 transfer to the party's own address. Wherever the canonical ownerless Disperse deployment (0xD152f549545093347A162Dce210e7293f1452150, the same address across chains, unowned since 2018) exists, the deployment record composes it directly; a local development record wires MockDisperse mirroring its verified interface (record key: multisender)."
                    />
                </ul>
                <p className="text-sm text-ink-muted mt-4">
                    The RPGF reward&apos;s rising-budget schedule and its scoring formula are catalogued once, on <Link href="/rpgf" className="underline">RPGF</Link> &mdash; this page states the contract surface (functions, events, storage), not the schedule.
                </p>
            </MarketingSection>

            <MarketingSection title="Canonical deployments" sectionId="deployments">
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
                            <tr><td className="py-2 pr-4">Local Anvil</td><td className="py-2 pr-4 font-mono">31337</td><td className="py-2 text-ink-muted">A local development run&apos;s own record</td></tr>
                            {record && (
                                <tr><td className="py-2 pr-4">Public record</td><td className="py-2 pr-4 font-mono">{String(record.chainId ?? 11155111)}</td><td className="py-2 text-ink-muted">Committed &mdash; addresses below</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {record && (
                    <div className="overflow-x-auto -mx-6 px-6 mt-4">
                        <p className="text-xs text-ink-muted mb-2">
                            The public record&apos;s addresses, from the committed{" "}
                            <a href="https://github.com/figaro-protocol/Figaro/blob/main/deployments/11155111.json" target="_blank" rel="noopener noreferrer" className="underline"><code>deployments/11155111.json</code></a>{" "}
                            (deployment block <span className="font-mono">{String(record.deploymentBlock)}</span>) &mdash; this table renders the record, it never restates it:
                        </p>
                        {recordSha && (
                            <p className="text-xs text-ink-muted mb-2">
                                Verify the record in one comparison rather than address by address &mdash; its committed bytes hash to{" "}
                                <span className="font-mono break-all">{`sha256:${recordSha}`}</span>; check it yourself:{" "}
                                <code className="break-all">curl -s https://raw.githubusercontent.com/figaro-protocol/Figaro/main/deployments/11155111.json | shasum -a 256</code>.
                                This page computes the hash from the same file at build, so the two agreeing means the site and the repository are serving the same record.
                            </p>
                        )}
                        <table className="w-full text-xs">
                            <tbody className="[&>tr]:border-b [&>tr]:border-default">
                                {Object.entries(record)
                                    .filter((entry): entry is [string, string] =>
                                        typeof entry[1] === "string" && entry[1].startsWith("0x"))
                                    .map(([key, address]) => (
                                        <tr key={key}>
                                            <td className="py-1.5 pr-4"><code>{key}</code></td>
                                            <td className="py-1.5 font-mono break-all">
                                                <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noopener noreferrer" className="underline">{address}</a>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-ink-muted mt-4">
                    Per-network contract addresses ship in the deployment record the deploy script emits &mdash; <code>.deployments/local.json</code> for a local development run, <code>deployments/&lt;chainId&gt;.json</code> committed per public deploy.
                </p>

                <h3 className="text-heading-h3 text-ink-heading mt-10 mb-4">
                    Production endpoints: what a deployment must provision.
                </h3>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Addresses are the easy half. The protocol keeps <em>fingerprints</em> on chain and publishes <em>events</em>, so every read a client makes is either a log scan or an IPFS fetch &mdash; and both endpoints are yours to choose. Nothing here is hosted by this project; the defaults baked into any build are defaults, not dependencies.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>An RPC endpoint that tolerates wide <code>eth_getLogs</code> ranges.</strong> Discovery has no getters to fall back on &mdash; there is no view returning a member&apos;s current profile URI, for one; the event log <em>is</em> the read path &mdash; so a cold client scans the whole history of each registry. Public endpoints cap a single call&apos;s block range and the cap is not standard: 1,000, 10,000 and 50,000 blocks are all in the wild, with providers rejecting an over-range call in their own wording rather than a shared error code. Provision for the class, not a vendor: <strong>keyless public endpoints in the 50,000-block class exist and serve this stack</strong> &mdash; the live batch settlements above were driven through one. Clients must chunk regardless. The SDK&apos;s bulk fetchers (<code>fetchCoreEvents</code>, <code>fetchDiscoveryEvents</code>, <code>fetchUsageRecords</code>, <code>fetchBatchUsageRecords</code>) chunk internally at 9,500 blocks and take a trailing <code>chunkSize</code> to tune for a stricter or a more permissive provider; the reference frontend instead halves its window on any range-cap refusal, down to a 500-block floor, so one build works against all three classes.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>And start every scan at <code>deploymentBlock</code>.</strong> It is in the record{record && <> (<span className="font-mono">{String(record.deploymentBlock)}</span> in the public record)</>} for exactly this reason &mdash; see the crosswalk below. <code>fromBlock: 0n</code> is a local-development habit; on a public network it is a great deal of range scanned for nothing, and on a capped provider it is the difference between a client that loads and one that never does.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>IPFS pinning is the publisher&apos;s own.</strong> The chain holds the fingerprint; the agreement, the assembly template and the profile behind it live on IPFS, and a counterparty, an indexer or a dispute forum retrieves each by CID. IPFS does not auto-replicate &mdash; content lives only on the nodes that pin it, so one node is one point of failure. The production posture is <strong>sovereign per-party pinning</strong>: each publishing wallet&apos;s client pins what that wallet authors, so no operator is the custodian of anyone else&apos;s availability. Size it against the retrieval window, not the trade: a commitment&apos;s documents must stay fetchable for the life of any possible dispute or audit &mdash; a floor of <strong>six years</strong>, anchored to the tax-audit horizon (most administrations can audit ~5 years back, plus the year between a transaction and its declaration), extensible per agreement by the parties. In practice that means either a node you keep running for six years or a <strong>managed multi-node pinning service</strong> under your own account &mdash; a class, not a name, and the choice never becomes anyone else&apos;s custody.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong>Provision reads as a chain of gateways, not one.</strong> No single gateway serves both halves of an open registry: a dedicated gateway on your own pin service answers instantly for everything <em>you</em> pinned and knows nothing else, while a public gateway reaches content anyone pinned anywhere but can take many minutes to find a fresh pin. The pattern the reference frontend ships is the dedicated gateway first and a public gateway as the read fallback, with a user&apos;s own gateway override replacing the whole chain &mdash; their node, their choice, no read leaking past it. Expect the propagation lag and build for it: a surface that reads a just-pinned CID once and gives up shows a blank where a name belongs until someone reloads. The reference frontend keeps re-reading instead &mdash; 10&nbsp;s, 20&nbsp;s, 40&nbsp;s, then once a minute for as long as the reader is on screen &mdash; and treats only permanent failures (an integrity mismatch, an unparseable document) as final.
                </p>

                <h3 className="text-heading-h3 text-ink-heading mt-10 mb-4">
                    Record key &rarr; SDK field &rarr; contract.
                </h3>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>The keys in that record are not the SDK&apos;s field names.</strong> Spread a record verbatim into a <code>FigaroAddresses</code> and the renamed fields come back <code>undefined</code> &mdash; silently, because every field but one is optional. Map it once instead, with <code>addressesFromDeploymentRecord</code> from <code>@figaro-protocol/sdk</code>: it is the single place the two vocabularies meet. Two keys are renamed, five carry no SDK field at all (<code>florinToken</code>, <code>swapQuoter</code>, <code>permitTokenAddress</code>, <code>chainId</code>, <code>deploymentBlock</code>), and every other address key passes through under the same name.
                </p>
                <pre
                    tabIndex={0}
                    className="font-mono text-xs bg-subtle border border-default rounded px-3 py-3 mb-4 overflow-x-auto whitespace-pre"
                >
                    <code>{`import { addressesFromDeploymentRecord } from "@figaro-protocol/sdk";
const addresses = addressesFromDeploymentRecord(record);   // never { ...record }`}</code></pre>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Deployment-record key</th>
                                <th scope="col" className="py-2 pr-4"><code>FigaroAddresses</code> field</th>
                                <th scope="col" className="py-2">Contract, and what to know</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">figaroCore</td>
                                <td className="py-2 pr-4 font-mono text-xs">core</td>
                                <td className="py-2 text-ink-body"><code>FigaroCore</code>. The one <em>required</em> field &mdash; the mapping throws if the record has no <code>figaroCore</code>, rather than letting an undefined kernel address surface later as an opaque transport error.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">tokenAddress</td>
                                <td className="py-2 pr-4 font-mono text-xs">token</td>
                                <td className="py-2 text-ink-body">A settlement ERC-20 a local development run deploys for its own tests. <strong>Public records do not carry this key</strong>, so <code>token</code> is absent after mapping &mdash; which is correct, not a fault: a process is denominated by the <code>currency</code> inside each signed commitment, and nothing in the SDK reads <code>addresses.token</code>.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">permitTokenAddress</td>
                                <td className="py-2 pr-4 text-ink-muted">&mdash; none &mdash;</td>
                                <td className="py-2 text-ink-body">A second local-run ERC-20 (MPMT) deployed for the permit-funded flows&apos; own tests. <strong>Public records do not carry this key</strong>, and the SDK does not read it; like <code>tokenAddress</code>, denomination comes from the <code>currency</code> inside each signed commitment.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">florinToken</td>
                                <td className="py-2 pr-4 text-ink-muted">&mdash; none &mdash;</td>
                                <td className="py-2 text-ink-body"><code>FlorinToken</code>. Not part of <code>FigaroAddresses</code>; read it off the record and pass it where you need it (with <code>FLORIN_TOKEN_ABI</code>).</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">swapQuoter</td>
                                <td className="py-2 pr-4 text-ink-muted">&mdash; none &mdash;</td>
                                <td className="py-2 text-ink-body">A Uniswap QuoterV2 for pre-trade quotes &mdash; a client-side convenience, not a protocol contract. The SDK does not know this key.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">chainId · deploymentBlock</td>
                                <td className="py-2 pr-4 text-ink-muted">&mdash; none &mdash;</td>
                                <td className="py-2 text-ink-body">Not addresses. <code>deploymentBlock</code> is the <code>fromBlock</code> to start every <code>getLogs</code> scan at &mdash; scanning from <code>0n</code> on a public network is a great deal of wasted range.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">attestationCoordinator · clauseRegistry · membersRegistry · assemblyRegistry · batchVerifier · usageCounter · rpgfMinter · permit2 · swapRouter · witnessSwapAndCommitCoordinator · multisender · daoTreasury</td>
                                <td className="py-2 pr-4 text-ink-body">same name, all optional</td>
                                <td className="py-2 text-ink-body">The contracts of those names catalogued above. Each passes through only when the record carries it, so a record from a network that deployed fewer of them yields a <code>FigaroAddresses</code> with fewer fields &mdash; absence, never a placeholder.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mt-4">
                    <strong>Every other key is ignored, never an error.</strong> The mapping reads the keys above and nothing else, so a record carrying keys the SDK has never heard of &mdash; a local development record&apos;s own extras, a future deployment&apos;s additions &mdash; maps cleanly and silently drops them. Only a missing <code>figaroCore</code> throws.
                </p>
                <p className="text-xs text-ink-muted mt-4">
                    Kernel surface is frozen for external audit. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/AUDITOR_HANDOVER.md" target="_blank" rel="noopener noreferrer" className="underline">AUDITOR_HANDOVER.md</a>{" "}
                    for the frozen-surface declaration, how to verify it, and the validation gate.
                </p>
            </MarketingSection>

            <MarketingSection title="Errors, by name." sectionId="errors">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Every named custom error you can hit by <em>calling</em> the contracts catalogued above, in the order of the lifecycle that throws them: what threw it, what it means in plain words, and what to do. Reverts here are the protocol refusing to hold something it cannot secure &mdash; each one names its own reason, and most name the numbers too.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">
                    <strong>The boundary.</strong> Runtime errors only. Deliberately absent: constructor-argument errors (<code>ZeroAddress</code>, <code>EmptyPeriods</code>, <code>PeriodsNotAscending</code>, <code>TooManyPeriods</code>, <code>ZeroMinSellers</code>, <code>AmountsPeriodsMismatch</code>, <code>ZeroVerifier</code>, <code>VerifierNotContract</code>, <code>ZeroClauseRegistry</code>, <code>ZeroUsageCounter</code>) &mdash; a deployer&apos;s concern, not a caller&apos;s; <code>FlorinToken</code>&apos;s minter-registry errors, wired once at genesis and then renounced; and the local development mocks. The SDK&apos;s own refusals are plain JavaScript <code>Error</code>s with prose messages &mdash; the one exception is <code>SequencerError</code>, which carries a <code>.statusCode</code> (400 signature or witness-gate rejection, carrying the kernel&apos;s own reason string &mdash; or malformed JSON; 422 valid JSON that is not an operation shape; 413 over the 1&nbsp;MiB body cap; 503 mempool at capacity &mdash; capacity, never rejection, so retry after the next batch).
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    <strong>Decoding them.</strong> Every ABI below is a root <code>@figaro-protocol/sdk</code> export carrying its contract&apos;s error fragments, so a revert decodes by name instead of arriving as opaque bytes: <code>CORE_ABI</code> (the kernel&apos;s errors <em>and</em> the standard ERC-20 ones, including <code>ERC20InsufficientAllowance</code>), <code>CLAUSE_REGISTRY_ABI</code>, <code>MEMBERS_REGISTRY_ABI</code>, <code>ASSEMBLY_REGISTRY_ABI</code>, <code>USAGE_COUNTER_ABI</code>, <code>RPGF_MINTER_ABI</code>, <code>WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI</code>, <code>ATTESTATION_COORDINATOR_ABI</code>. <code>BATCH_VERIFIER_ABI</code> carries the settlement-reachable fragments too (its constructor guards are deploy-time only and omitted).
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Error</th>
                                <th scope="col" className="py-2 pr-4">Thrown by</th>
                                <th scope="col" className="py-2 pr-4">What it means</th>
                                <th scope="col" className="py-2">The fix</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            {ERRORS.map((group) => (
                                <Fragment key={group.stage}>
                                    <tr>
                                        <th scope="colgroup" colSpan={4} className="py-3 text-left text-ink-heading font-semibold">
                                            {group.stage}
                                        </th>
                                    </tr>
                                    {group.rows.map((row) => (
                                        <tr key={row.name}>
                                            <td className="py-2 pr-4 font-mono text-xs break-words">{row.name}</td>
                                            <td className="py-2 pr-4 text-ink-muted">{row.from}</td>
                                            <td className="py-2 pr-4 text-ink-body">{row.cause}</td>
                                            <td className="py-2 text-ink-body">{row.fix}</td>
                                        </tr>
                                    ))}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-muted leading-relaxed mt-6">
                    Two of these fail <em>silently</em> rather than reverting where you are looking &mdash; the dual-<code>processId</code> confusion and a closed accrual period. Those, and the rest of the traps that no revert warns you about, are on <Link href="/pitfalls" className="underline">Sharp edges</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Composition" sectionId="composition">
                <p className="text-sm text-ink-body leading-relaxed">
                    Mechanisms, clauses, and role models extend the protocol without altering the kernel. The kernel invariants the Composition doctrine protects are shown on <Link href="/kernel" className="underline">Kernel</Link>; the academic frame for why the kernel is narrow is on <Link href="/working-groups" className="underline">Working Groups</Link>. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/CLAUSES.md" target="_blank" rel="noopener noreferrer" className="underline">CLAUSES.md</a>{" "}
                    for the clause validation architecture and the anchoring doctrine, and the{" "}
                    <Link href="/clauses" className="underline">Clauses</Link> and <Link href="/assemblies" className="underline">Assemblies</Link> surfaces for composition tools. The external half &mdash; forums, offset markets, payout routing, and the rest of the compositional surface named above (<code>witnessSwapAndCommitCoordinator</code>, <code>multisender</code>, and the funding contracts) &mdash; is catalogued on <Link href="/composition" className="underline">Composition</Link>.
                </p>
            </MarketingSection>

        </>
    );
}
