/**
 * @figaro-protocol/sdk — ABIs
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
// THE one home for this ABI (maintainer ruling 2026-07-06): the coordinator's
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
    "error NotAuthorized()",
    "error ProcessMismatch()",
    "error UnknownOrder()",
    "error OrderResolved()",
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

// ── Permit2 ABI (Uniswap canonical, external contract) ──────────────────────
//
// Permit2 is NOT a Figaro contract — it is the external, canonical
// SignatureTransfer deployment (same address on every chain it's deployed to)
// that `WitnessSwapAndCommitCoordinator` pulls a party's swap-input token
// through (`src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol` —
// `IPermit2WitnessTransfer`). This is the MINIMAL surface the coordinator's
// off-chain half (`swapFunding.ts`, `buildSwapWitnessTypedData`) exists for:
// the WITNESS variant of `permitTransferFrom`, which folds the coordinator's
// `SwapWitness` into the digest the party signs so a relayer cannot
// substitute the swap route. Curated here — same rationale as `ERC20_ABI`
// above (an external, ABI-stable standard, not a Figaro contract) — so an
// integrator building a swap-funded leg imports ONE canonical ABI instead of
// hand-rolling it or re-fetching Uniswap's own.

const PERMIT2_TOKEN_PERMISSIONS_TUPLE = "(address token, uint256 amount)";
const PERMIT2_PERMIT_TRANSFER_FROM_TUPLE =
    `(${PERMIT2_TOKEN_PERMISSIONS_TUPLE} permitted, uint256 nonce, uint256 deadline)`;
const PERMIT2_SIGNATURE_TRANSFER_DETAILS_TUPLE = "(address to, uint256 requestedAmount)";

export const PERMIT2_ABI = parseAbi([
    `function permitWitnessTransferFrom(${PERMIT2_PERMIT_TRANSFER_FROM_TUPLE} permit, ${PERMIT2_SIGNATURE_TRANSFER_DETAILS_TUPLE} transferDetails, address owner, bytes32 witness, string witnessTypeString, bytes signature) external`,
]);

// ── Uniswap SwapRouter02 + QuoterV2 ABIs (canonical, external contracts) ────
//
// Also not Figaro contracts — the production venue
// `WitnessSwapAndCommitCoordinator`'s immutable `router` points at is
// Uniswap's SwapRouter02 (the deploy scripts probe `factory()` + `WETH9()`
// before wiring one; devnet substitutes `MockSwapVenue`, an ABI-INCOMPATIBLE
// settable-rate stand-in). The coordinator never decodes this ABI on-chain —
// it forceApproves the router for the input token and forwards the party's
// witness-signed `swapData` verbatim via `router.call(...)` — so the venue
// must PULL the input by ERC-20 allowance and deliver the output to a
// recipient. SwapRouter02's `exactOutputSingle` does exactly that: an exact
// output (the bond) for at most `amountInMaximum` of input, pulled by
// allowance. This is the ABI whoever builds `swapData` encodes against (the
// venue seam: `frontend/lib/composition/swapVenue.ts`); `factory()` doubles
// as the probe that tells SwapRouter02 apart from the devnet stand-in.
// Curated here so integrators import ONE canonical ABI instead of re-fetching
// Uniswap's own.

export const SWAP_ROUTER_02_ABI = parseAbi([
    "function factory() view returns (address)",
    "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
]);

// QuoterV2 — the read-side sibling: how much input yields an exact output, at
// one fee tier. Its quote functions are deliberately not `view` (they
// revert-and-decode internally), so read them through eth_call
// (`publicClient.call` + `decodeFunctionResult`), never as a transaction.

export const QUOTER_V2_ABI = parseAbi([
    "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

// ── ClauseRegistry ABI ──────────────────────────────────────────────────────

export const CLAUSE_REGISTRY_ABI = parseAbi([
    "function registered(bytes32 clauseId) view returns (bool)",
    "function contentHashOf(bytes32 idHash) view returns (bytes32)",
    "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) external payable",
    "function withdrawDeposit(bytes32 idHash) external",
    "function registrationDeposit() view returns (uint256)",
    "function depositOf(bytes32 idHash) view returns (address registeredBy, bool withdrawn)",
    "function setMechanismClause(bytes32 idHash) external",
    "event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string contentURI, address indexed registeredBy)",
    "event DepositWithdrawn(bytes32 indexed clauseId, address indexed registeredBy, uint256 amount)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed idHash)",
    "error AlreadyRegistered(bytes32 clauseId)",
    "error NotRegistered(bytes32 clauseId)",
    "error EmptyClauseId()",
    "error EmptyContentURI()",
    "error ZeroContentHash()",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegisteredBy(address caller, address registeredBy)",
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
    "function bindings(bytes32 compositionHash) view returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string contentURI)",
    "function registrationDeposit() view returns (uint256)",
    "event AssemblyRegistered(bytes32 indexed compositionHash, address indexed registeredBy, string contentURI)",
    "event DepositWithdrawn(bytes32 indexed compositionHash, address indexed registeredBy, uint256 amount)",
    "error EmptyContentURI()",
    "error ZeroCompositionHash()",
    "error CompositionAlreadyRegistered(bytes32 compositionHash)",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistered()",
    "error NotRegisteredBy(address caller, address registeredBy)",
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
// Verified clause-or-assembly usage, counted when it happens. `recordClauseUsage` is
// permissionless: it proves the order is RESOLVED (`core.orderStatus == 2`)
// and that the clause or assembly is merkle-included in the signed `agreementHash` —
// the same leaf shape `computeSectionLeaf` builds. It carries only the section
// FINGERPRINT `sectionHash` (`keccak256` of the committed bytes), never the
// preimage, so a `private` section's plaintext never touches public calldata.
// `recordAssemblyUsage` takes no section at all — the provenance content is
// fully determined by `compositionHash`, so the contract derives it. Accrual
// buckets into fixed periods; a period's counts are final once `periodClosed`.
//
// BATCH-SETTLED trade never touches the kernel, so it can never travel that
// path. It arrives instead through `applyBatchAccrual`, which only
// FigaroBatchVerifier may call and only with numbers an SP1 proof committed.
// Its accrual is kept in a SEPARATE slot (`batchAccrualOf`) and merged by
// SCORE, never by component — read `scoreOf` for a clause or assembly's real total;
// `accrualOf` alone sees the direct path and under-reports anything that
// scaled.

export const USAGE_COUNTER_ABI = parseAbi([
    // ── Recording (permissionless) ──────────────────────────────────
    `function recordClauseUsage(${COMMITMENT_TUPLE} order, bytes32 clauseOrAssembly, bytes32 sectionHash, bytes32[] proof) external`,
    `function recordAssemblyUsage(${COMMITMENT_TUPLE} order, bytes32 compositionHash, bytes32[] proof) external`,

    // ── Composition + schedule ──────────────────────────────────────
    "function core() view returns (address)",
    "function members() view returns (address)",
    "function batchVerifier() view returns (address)",
    "function provenanceClause() view returns (bytes32)",
    "function excludedClauseOrAssembly(bytes32 clauseOrAssembly) view returns (bool)",
    "function periodEnd(uint256) view returns (uint64)",
    "function periodCount() view returns (uint256)",
    "function currentPeriod() view returns (uint8)",
    "function periodClosed(uint8 period) view returns (bool)",

    // ── Accrual ─────────────────────────────────────────────────────
    "function accrualOf(bytes32 clauseOrAssembly, uint8 period) view returns (uint64 c, uint64 d, uint256 score)",
    "function batchAccrualOf(bytes32 clauseOrAssembly, uint8 period) view returns (uint64 c, uint64 d, uint256 score)",
    "function scoreOf(bytes32 clauseOrAssembly, uint8 period) view returns (uint256)",
    "function totalScoreIn(uint8 period) view returns (uint256)",
    "function processCounted(bytes32 clauseOrAssembly, bytes32 processId) view returns (bool)",
    "function sellerSeen(bytes32 clauseOrAssembly, uint8 period, address seller) view returns (bool)",
    "function minSellers() view returns (uint64)",
    "function icbrt(uint256 n) pure returns (uint256)",

    // ── Events ──────────────────────────────────────────────────────
    "event UsageRecorded(bytes32 indexed clauseOrAssembly, uint8 indexed period, bytes32 indexed processId, address seller, uint64 c, uint64 d, uint256 score)",
    "event BatchUsageRecorded(bytes32 indexed clauseOrAssembly, uint8 indexed period, uint64 c, uint64 d, uint256 score)",

    // ── Errors ──────────────────────────────────────────────────────
    "error ZeroAddress()",
    "error ZeroMinSellers()",
    "error EmptyPeriods()",
    "error TooManyPeriods()",
    "error PeriodsNotAscending()",
    "error AccrualClosed()",
    "error UnknownOrder()",
    "error OrderNotResolved()",
    "error AlreadyCounted()",
    "error InvalidInclusionProof()",
    "error SellerNotStaked(address seller)",
    "error ClauseOrAssemblyExcluded(bytes32 clauseOrAssembly)",
    "error ClauseOrAssemblyNotRegistered(bytes32 clauseOrAssembly)",
    "error NotBatchVerifier()",
    "error PeriodMismatch(uint8 open, uint8 claimed)",
    "error ProvenanceClauseMismatch(bytes32 expected, bytes32 claimed)",
    "error AccrualWentBackwards(bytes32 clauseOrAssembly)",
]);

/// The batch path's accrual event. An indexer summing adoption must fold BOTH
/// this and `UsageRecorded` — and fold them differently: `UsageRecorded` is a
/// per-process increment, while this carries a clause or assembly's CUMULATIVE (c, d)
/// for the period and REPLACES the previous value rather than adding to it.
export const EV_BATCH_USAGE_RECORDED = parseAbiItem(
    "event BatchUsageRecorded(bytes32 indexed clauseOrAssembly, uint8 indexed period, uint64 c, uint64 d, uint256 score)",
);

export const EV_USAGE_RECORDED = parseAbiItem(
    "event UsageRecorded(bytes32 indexed clauseOrAssembly, uint8 indexed period, bytes32 indexed processId, address seller, uint64 c, uint64 d, uint256 score)",
);

// ── RpgfMinter ABI ────────────────────────────────────────────────────────
//
// The 600M retroactive distribution: one claim per accrual period, from a
// per-period budget validated against the counter's schedule at deploy (the
// reference schedule: nine annual periods, budgets grouped 15/30/55 into
// three rising tranches — deploy-script data, not contract state). There is
// nothing to post, nothing to bond and nothing to dispute — a claim is
// UNIFORM pro rata over a closed period's final counts (no cap), to authors
// of record with a LIVE stake.

export const RPGF_MINTER_ABI = parseAbi([
    "function claim(uint8 periodId, bytes32[] clausesOrAssemblies) external",
    "function claimable(uint8 periodId, address account, bytes32[] clausesOrAssemblies) view returns (uint256)",
    "function periodAmount(uint256) view returns (uint256)",
    "function periodCount() view returns (uint256)",
    "function minted(uint8 periodId) view returns (uint256)",
    "function claimed(uint8 periodId, address account) view returns (bool)",
    "function florin() view returns (address)",
    "function counter() view returns (address)",
    "function clauses() view returns (address)",
    "function assemblies() view returns (address)",
    "event Claimed(uint8 indexed periodId, address indexed account, uint256 amount, uint256 score)",
    "error ZeroAddress()",
    "error UnknownPeriod(uint8 periodId)",
    "error AmountsPeriodsMismatch(uint256 amounts, uint256 periods)",
    "error PeriodStillAccruing(uint8 periodId)",
    "error AlreadyClaimed(uint8 periodId, address account)",
    "error NoClausesOrAssemblies()",
    "error DuplicateClauseOrAssembly(bytes32 clauseOrAssembly)",
    "error NotAuthorOfRecord(bytes32 clauseOrAssembly, address caller)",
    "error NothingToClaim()",
    "error PeriodBudgetExceeded(uint8 periodId)",
]);

// ── FigaroBatchVerifier ABI ──────────────────────────────────────────────────
// The batch-settlement verifier (proof-based scaling). settleBatch carries the
// proof, the 8-word public values, net positions, the event data — the
// attestations to re-emit plus the (clause key → witness-spec hash) bindings
// the contract checks against ClauseRegistry.contentHashOf before settling —
// and the RPGF usage accrual, which it forwards to UsageCounter. A batch that
// credits no usage passes empty arrays; that call is a no-op, which is what
// lets trade keep settling after the reward's last period closes.

export const BATCH_VERIFIER_ABI = parseAbi([
    // ── Batch settlement ────────────────────────────────────────────
    "function settleBatch(bytes proof, bytes publicValues, (address token, address user, uint256 deposit, uint256 payout)[] positions, ((bytes32 orderHash, bytes32 processId, address attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)[] attestations, (bytes32 clauseId, bytes32 specHash)[] specBindings) events, (uint8 period, bytes32 provenanceClause, (bytes32 clauseOrAssembly, uint64 c, uint64 d)[] accruals, address[] sellers) usage) external",

    // ── Views ────────────────────────────────────────────────────────
    "function stateRoot() view returns (bytes32)",
    "function batchCount() view returns (uint64)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",
    "function clauseRegistry() view returns (address)",
    "function usageCounter() view returns (address)",

    // ── Events (Attestation shares its topic with the coordinator's —
    //    indexers filter by address) ─────────────────────────────────
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",

    // ── Errors (settlement-reachable; constructor guards omitted) ────
    "error StateRootMismatch(bytes32 expected, bytes32 actual)",
    "error ChainIdMismatch(uint64 expected, uint64 actual)",
    "error VerifyingContractMismatch(address expected, address actual)",
    "error PositionHashMismatch()",
    "error AttestationHashMismatch()",
    "error SpecBindingsHashMismatch()",
    "error UsageAccrualHashMismatch()",
    "error SpecBindingMismatch(bytes32 clauseId, bytes32 anchored, bytes32 proven)",
    "error FeeOnTransferDetected()",
]);
