/**
 * @figaro/sdk — ABIs
 *
 * Canonical ABI definitions for all Figaro contracts.
 * These are the source of truth — the frontend should eventually import from here.
 */

import { parseAbi, parseAbiItem } from "viem";

// ── Commitment struct type (shared across ABI strings) ──────────────────────
// Matches CommitmentTypes.Commitment in Solidity:
//   (bytes32 processId, address buyer, address seller, address currency,
//    uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash,
//    uint256 salt, uint256 deadline)

/** The kernel `Commitment` struct as an ABI tuple string. A core primitive —
 *  exported so contracts the frontend composes with (which take a Commitment as
 *  a calldata arg) can build their ABIs without re-stating the kernel struct. */
export const COMMITMENT_TUPLE =
    "(bytes32 processId, address buyer, address seller, address currency, uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)";

// ── FigaroCore ABI ──────────────────────────────────────────────────────────

export const CORE_ABI = parseAbi([
    // ── Unified commitment (dual-signed, atomic bond lock) ──────────
    `function commit(${COMMITMENT_TUPLE} c, bytes buyerSig, bytes sellerSig) external returns (bytes32 processId, bytes32 orderHash)`,

    // ── Resolution (buyer dominance, atomic, direct transfer) ───────
    `function resolveProcess(bytes32 processId, ${COMMITMENT_TUPLE}[] commitments) external`,

    // ── Process state views ─────────────────────────────────────────
    "function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint256 activeOrderCount)",
    "function orderStatus(bytes32 orderHash) view returns (uint8)",
    "function orderProcessId(bytes32 orderHash) view returns (bytes32)",

    // ── Events ──────────────────────────────────────────────────────
    "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)",
    "event OrderSeller(bytes32 indexed orderHash, address indexed seller)",
    "event OrderCurrency(bytes32 indexed orderHash, address indexed currency)",
    "event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)",
    "event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)",

    // ── Errors (must mirror src/kernel/FigaroCore.sol) ──────────────────────
    // Carried in the ABI so viem can decode reverts by name rather than
    // surfacing raw 4-byte selectors. Order matches the contract.
    "error DeadlineExpired()",
    "error InvalidBuyerSignature()",
    "error InvalidSellerSignature()",
    "error ZeroPayment()",
    "error ProcessAlreadyExists()",
    "error UnknownProcess()",
    "error CumulativeValueMismatch(uint256 expected, uint256 actual)",
    "error NotProcessBuyer()",
    "error CurrencyMismatch()",
    "error OrderNotCommitted(bytes32 orderHash)",
    "error NoActiveOrders()",
    "error IncompleteOrderList(uint256 required, uint256 provided)",
    "error DuplicateCommitment()",
    "error FeeOnTransferDetected()",
    "error InvalidRootCumulativeValue()",
    "error ProcessAlreadyResolved()",

    // ── Settlement-token errors (ERC-6093, OpenZeppelin ERC-20) ──────
    // Not kernel errors: the kernel pulls bonds with safeTransferFrom, so a
    // shortfall reverts inside the token contract and its selector bubbles
    // up through the kernel call. Carried here so viem decodes e.g.
    // ERC20InsufficientAllowance by name instead of a raw 4-byte selector.
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InvalidSender(address sender)",
    "error ERC20InvalidReceiver(address receiver)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    "error ERC20InvalidApprover(address approver)",
    "error ERC20InvalidSpender(address spender)",
]);

// ── Individual event ABIs (for log filtering) ───────────────────────────────

export const EV_ORDER_COMMITTED = parseAbiItem(
    "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)",
);

export const EV_ORDER_SELLER = parseAbiItem(
    "event OrderSeller(bytes32 indexed orderHash, address indexed seller)",
);

export const EV_ORDER_CURRENCY = parseAbiItem(
    "event OrderCurrency(bytes32 indexed orderHash, address indexed currency)",
);

export const EV_ORDER_RESOLVED = parseAbiItem(
    "event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)",
);

export const EV_PROCESS_RESOLVED = parseAbiItem(
    "event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)",
);

// ── AttestationCoordinator ABI ──────────────────────────────────────────────
//
// THE one home for this ABI (operator ruling 2026-07-06): the coordinator's
// kernel reads are DESIGN, not a defect. `core.orderStatus` anchors every
// attestation to a live committed order (without it, a merkle proof shows a
// clause is in *some* agreement, not THE order's agreement) and
// `core.DOMAIN_SEPARATOR` derives root processIds with no silent-drift risk.
// Read-side role *display* is indexer-derived in the UI; write-side role
// *verification* stays here — that is what makes the record evidence.
// `attestViaResolver` (IRoleResolver) is the open composition path for
// mechanism-contract sellers.

export const ATTESTATION_COORDINATOR_ABI = parseAbi([
    "function core() view returns (address)",
    // All three paths take the full Commitment(s) so the coordinator can
    // recover `agreementHash` without new kernel state, and carry the section
    // FINGERPRINT `sectionHash` (`keccak256(sectionData)`) + merkle `proof` so
    // the clause is provably part of the signed agreement. The content
    // FINGERPRINT `contentRef` (`keccak256(content)`) is supplied too — never the
    // preimage, so a `private` section's plaintext never touches public calldata;
    // it lives off-chain (encrypted IPFS) bound to this hash. There is no on-chain
    // clause-content validator. Matches the batched path's bytes32 convention.
    `function attestAsSeller(${COMMITMENT_TUPLE} role, ${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef) external`,
    `function attestAsBuyer(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef) external`,
    `function attestViaResolver(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);

// ── WitnessSwapAndCommitCoordinator ABI ─────────────────────────────────────
//
// Off-protocol executor: fund a FigaroCore bond from a swapped input token,
// with the swap route bound into the party's Permit2 witness signature. The
// coordinator funds the party in-place (the kernel pulls the bond from
// `c.buyer`/`c.seller`, never `msg.sender`), so the commitment stays
// bilaterally signed and the coordinator is never a counterparty.

/** The coordinator's per-leg `SwapFunding` struct as an ABI tuple string.
 *  `enabled = false` skips the leg (the party self-funds the bond currency). */
export const SWAP_FUNDING_TUPLE =
    "(bool enabled, address inputToken, uint256 maxInput, uint256 permitNonce, uint256 permitDeadline, bytes permitSignature, bytes swapData)";

export const WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI = parseAbi([
    "function figaroCore() view returns (address)",
    "function permit2() view returns (address)",
    "function router() view returns (address)",
    // Recomputes the Permit2 witness a party must sign for a leg — binds
    // {router, inputToken, maxInput, keccak256(swapData)} so the signature
    // covers the exact swap route.
    "function swapWitness(address inputToken, uint256 maxInput, bytes swapData) view returns (bytes32)",
    `function swapAndCommit(${COMMITMENT_TUPLE} c, bytes buyerSig, bytes sellerSig, ${SWAP_FUNDING_TUPLE} buyerFunding, ${SWAP_FUNDING_TUPLE} sellerFunding) external returns (bytes32 processId, bytes32 orderHash)`,
    "error NothingToFund()",
    "error SwapCallFailed()",
    "error OutputBelowBond(uint256 received, uint256 required)",
]);

// ── ClauseRegistry ABI ──────────────────────────────────────────────────────

export const CLAUSE_REGISTRY_ABI = parseAbi([
    "function registered(bytes32 clauseId) view returns (bool)",
    "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) external payable",
    "function withdrawDeposit(bytes32 idHash) external",
    "function registrationDeposit() view returns (uint256)",
    "function depositOf(bytes32 idHash) view returns (address registrar, bool withdrawn)",
    "function setMechanismClause(bytes32 idHash) external",
    "event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string contentURI, address indexed registrar)",
    "event DepositWithdrawn(bytes32 indexed clauseId, address indexed registrar, uint256 amount)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed idHash)",
    "error AlreadyRegistered(bytes32 clauseId)",
    "error NotRegistered(bytes32 clauseId)",
    "error EmptyClauseId()",
    "error EmptyContentURI()",
    "error ZeroContentHash()",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistrar(address caller, address registrar)",
    "error AlreadyWithdrawn()",
    "error TransferFailed()",
]);


// ── ERC-20 ABI (standard + EIP-2612 permit) ────────────────────────────────

export const ERC20_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function nonces(address owner) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
]);

// ── MembersRegistry ABI ────────────────────────────────────────────────────

// Withdrawal is TWO calls: `requestWithdrawal` de-surfaces immediately and starts
// the cooldown; `withdraw` releases the ETH once `releaseAt` has passed. Readers
// that care about who is CURRENTLY surfaced fold `MemberWithdrawalRequested` —
// `MemberWithdrawn` is only the custody event and can arrive much later.
export const MEMBERS_REGISTRY_ABI = parseAbi([
    "function register(string metadataURI) external payable",
    "function updateProfile(string metadataURI) external",
    "function requestWithdrawal() external",
    "function withdraw() external",
    "function registered(address member) view returns (bool)",
    "function registrationDeposit() view returns (uint256)",
    "function withdrawalCooldown() view returns (uint256)",
    "function pendingDeposit(address member) view returns (uint256)",
    "function releaseAt(address member) view returns (uint256)",
    // Ask the CHAIN whether a claim is due — never compare `releaseAt` against a
    // client clock; block time and wall time drift, and the comparison silently
    // disables a legitimate claim. Mirrors `UsageCounter.periodClosed`.
    "function withdrawable(address member) view returns (bool)",
    "event MemberRegistered(address indexed member, string metadataURI)",
    "event MemberProfileUpdated(address indexed member, string metadataURI)",
    "event MemberWithdrawalRequested(address indexed member, uint256 amount, uint256 releaseAt)",
    "event MemberWithdrawn(address indexed member, uint256 amount)",
    "error AlreadyRegistered()",
    "error NotRegistered()",
    "error InsufficientDeposit()",
    "error NothingPending()",
    "error CooldownActive(uint256 releaseAt)",
    "error TransferFailed()",
]);

// ── AssemblyRegistry ABI ──────────────────────────────────────────────────

export const ASSEMBLY_REGISTRY_ABI = parseAbi([
    "function registerAssembly(bytes32 compositionHash, string contentURI) external payable",
    "function withdrawDeposit(bytes32 compositionHash) external",
    "function bindings(bytes32 compositionHash) view returns (address author, uint64 registeredAt, bool depositWithdrawn, string contentURI)",
    "function registrationDeposit() view returns (uint256)",
    "event AssemblyRegistered(bytes32 indexed compositionHash, address indexed author, string contentURI)",
    "event DepositWithdrawn(bytes32 indexed compositionHash, address indexed author, uint256 amount)",
    "error EmptyContentURI()",
    "error ZeroCompositionHash()",
    "error CompositionAlreadyRegistered(bytes32 compositionHash)",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistered()",
    "error NotAuthor(address caller, address author)",
    "error AlreadyWithdrawn()",
    "error TransferFailed()",
]);

// ── Florin Token ABIs ─────────────────────────────────────────────────────────

export const FLORIN_TOKEN_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    // emissionContract removed
    "function deployerMintRenounced() view returns (bool)",
    "function deployer() view returns (address)",
]);

// ── UsageCounter ABI ──────────────────────────────────────────────────────
//
// Verified artifact usage, counted when it happens. `recordClauseUsage` is
// permissionless: it proves the order is RESOLVED (`core.orderStatus == 2`)
// and that the artifact is merkle-included in the signed `agreementHash` —
// the same leaf shape `computeSectionLeaf` builds. It carries only the section
// FINGERPRINT `sectionHash` (`keccak256` of the committed bytes), never the
// preimage, so a `private` section's plaintext never touches public calldata.
// `recordAssemblyUsage` takes no section at all — the provenance content is
// fully determined by `compositionHash`, so the contract derives it. Accrual
// buckets into fixed periods; a period's counts are final once `periodClosed`.

export const USAGE_COUNTER_ABI = parseAbi([
    // ── Recording (permissionless) ──────────────────────────────────
    `function recordClauseUsage(${COMMITMENT_TUPLE} order, bytes32 artifact, bytes32 sectionHash, bytes32[] proof) external`,
    `function recordAssemblyUsage(${COMMITMENT_TUPLE} order, bytes32 compositionHash, bytes32[] proof) external`,

    // ── Composition + schedule ──────────────────────────────────────
    "function core() view returns (address)",
    "function sellers() view returns (address)",
    "function periodEnd(uint256) view returns (uint64)",
    "function periodCount() view returns (uint256)",
    "function currentPeriod() view returns (uint8)",
    "function periodClosed(uint8 period) view returns (bool)",

    // ── Breadth cap ─────────────────────────────────────────────────

    // ── Accrual ─────────────────────────────────────────────────────
    "function accrualOf(bytes32 artifact, uint8 period) view returns (uint64 c, uint64 d, uint256 score)",
    "function totalScoreIn(uint8 period) view returns (uint256)",
    "function processCounted(bytes32 artifact, bytes32 processId) view returns (bool)",
    "function pairSeen(bytes32 artifact, uint8 period, bytes32 pairKey) view returns (bool)",
    "function icbrt(uint256 n) pure returns (uint256)",

    // ── Events ──────────────────────────────────────────────────────
    "event UsageRecorded(bytes32 indexed artifact, uint8 indexed period, bytes32 indexed processId, bytes32 pairKey, uint64 c, uint64 d, uint256 score)",

    // ── Errors ──────────────────────────────────────────────────────
    "error ZeroAddress()",
    "error EmptyPeriods()",
    "error PeriodsNotAscending()",
    "error AccrualClosed()",
    "error UnknownOrder()",
    "error OrderNotResolved()",
    "error AlreadyCounted()",
    "error InvalidInclusionProof()",
    "error SellerNotStaked(address seller)",
]);

export const EV_USAGE_RECORDED = parseAbiItem(
    "event UsageRecorded(bytes32 indexed artifact, uint8 indexed period, bytes32 indexed processId, bytes32 pairKey, uint64 c, uint64 d, uint256 score)",
);

// ── RpgfMinter ABI ────────────────────────────────────────────────────────
//
// The 600M retroactive distribution: three declining tranches, tranche `i`
// paying for UsageCounter period `i`. There is nothing to post, nothing to
// bond and nothing to dispute — a claim is UNIFORM pro rata over a closed
// period's final counts (no cap), to authors of record with a LIVE stake.

export const RPGF_MINTER_ABI = parseAbi([
    "function claim(uint8 trancheId, bytes32[] artifacts) external",
    "function claimable(uint8 trancheId, address account, bytes32[] artifacts) view returns (uint256)",
    "function trancheAmount(uint256) view returns (uint256)",
    "function minted(uint8 trancheId) view returns (uint256)",
    "function claimed(uint8 trancheId, address account) view returns (bool)",
    "function TRANCHE_COUNT() view returns (uint8)",
    "function florin() view returns (address)",
    "function counter() view returns (address)",
    "function clauses() view returns (address)",
    "function assemblies() view returns (address)",
    "event Claimed(uint8 indexed trancheId, address indexed account, uint256 amount, uint256 score)",
    "error ZeroAddress()",
    "error UnknownTranche(uint8 trancheId)",
    "error TrancheStillAccruing(uint8 trancheId)",
    "error AlreadyClaimed(uint8 trancheId, address account)",
    "error NoArtifacts()",
    "error NotAuthorOfRecord(bytes32 artifact, address caller)",
    "error NothingToClaim()",
    "error TrancheBudgetExceeded(uint8 trancheId)",
]);

// ── FigaroBatchVerifier ABI ──────────────────────────────────────────────────
// The batch-settlement verifier (proof-based scaling). settleBatch carries the
// proof, the 7-word public values, net positions, and the event data — the
// attestations to re-emit plus the (clause key → witness-spec hash) bindings
// the contract checks against ClauseRegistry.contentHashOf before settling.

export const BATCH_VERIFIER_ABI = parseAbi([
    // ── Batch settlement ────────────────────────────────────────────
    "function settleBatch(bytes proof, bytes publicValues, (address token, address user, uint256 deposit, uint256 payout)[] positions, ((bytes32 orderHash, bytes32 processId, address attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)[] attestations, (bytes32 clauseId, bytes32 specHash)[] specBindings) events) external",

    // ── Views ────────────────────────────────────────────────────────
    "function stateRoot() view returns (bytes32)",
    "function batchCount() view returns (uint64)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",
    "function clauseRegistry() view returns (address)",

    // ── Events (Attestation shares its topic with the coordinator's —
    //    indexers filter by address) ─────────────────────────────────
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
]);
