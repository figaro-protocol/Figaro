// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/FigaroCore.sol";
import "../src/AttestationCoordinator.sol";
import "../src/ClauseRegistry.sol";
import "../src/SellerRegistry.sol";
import "../src/DutchAuction.sol";
import "../src/fig/FigToken.sol";
import "../src/fig/RpgfMinter.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/ClauseRegistrationHelper.sol";
import "../src/ProcessOffsetReceipt.sol";
import "../src/clauseValidators/FigaroCommerceV1Validator.sol";
import "../src/clauseValidators/FigaroGeoV1Validator.sol";
import "../src/clauseValidators/FigaroClassOfServiceValidator.sol";
import "../src/clauseValidators/FigaroModalitiesV1Validator.sol";
import "../src/clauseValidators/FigaroCoordinationV1Validator.sol";
import "../src/clauseValidators/FigaroHandoffV1Validator.sol";
import "../src/clauseValidators/FigaroGHGV1Validator.sol";
import "../src/clauseValidators/FigaroGHGMeasurementV1Validator.sol";
import "../src/clauseValidators/FigaroProximityPolicyV1Validator.sol";
import "../src/clauseValidators/FigaroProximityProofV1Validator.sol";
import "../src/clauseValidators/FigaroOffsetPolicyV1Validator.sol";
import "../src/clauseValidators/FigaroMerchantProcessV1Validator.sol";
import "../src/clauseValidators/FigaroCourierProcessV1Validator.sol";
import "../src/clauseValidators/FigaroArbitrationKlerosV1Validator.sol";
import "../src/clauseValidators/FigaroApplicableLawV1Validator.sol";
import "../src/clauseValidators/FigaroConsentV1Validator.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro V5 protocol stack
///
/// @notice Deploys all production contracts with no mocks. All security-sensitive
///         parameters are read from environment variables so they can be verified
///         independently before broadcast.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key (or use hardware wallet via flags)
///   SP1_VERIFIER               — address of the deployed Succinct SP1 verifier
///                                (shared by FigaroBatchVerifier and RpgfMinter)
///   SP1_PROGRAM_VKEY           — bytes32 verification key of the compiled figaro-kernel program
///   GENESIS_ROOT               — bytes32 initial state root from genesis KernelState::new()
///   RPGF_PROGRAM_VKEY          — bytes32 verification key of the compiled figaro-rpgf-prover program
///   RPGF_SUBMITTER             — address authorized to call RpgfMinter.submitRoot
///                                (the sequencer wallet)
///   FOUNDER_WALLET             — address receiving the 100M founder allocation at genesis
///   DAO_WALLET                 — address receiving the 300M DAO allocation at genesis
///   AIRDROP_UNLOCK_Y2          — unix timestamp at which year-2 claims open
///   AIRDROP_UNLOCK_Y5          — unix timestamp at which year-5 claims open
///   AIRDROP_UNLOCK_Y9          — unix timestamp at which year-9 claims open
///
/// FIG allocation (1B total, canonical):
///   100M  (10%)  founders — genesis mint to FOUNDER_WALLET (no vesting, no unlock)
///   300M  (30%)  DAO      — genesis mint to DAO_WALLET     (no vesting, no unlock)
///   600M  (60%)  airdrops — one RpgfMinter with three staged unlocks:
///                             stage 0 (year 2): up to 300M (30% of total)
///                             stage 1 (year 5): up to 200M (20% of total)
///                             stage 2 (year 9): up to 100M (10% of total)
///                           Per-tranche roots are submitted at tranche time by the
///                           sequencer after an SP1 proof verifies they correctly
///                           aggregate the clause-author substrate-broadening
///                           formula over chain-derived per-clause state. The
///                           on-chain cap is the FigToken 600M minter cap; per-stage
///                           caps live in the off-chain aggregation budget.
///
/// No settlement-anchored emission. No batch-path minting. FigaroBatchVerifier
/// is NOT a FIG minter and will never be registered as one.
///
/// @dev Deployer renounces minting rights at the end of this script. No new minters
///      can ever be registered afterward.
contract DeployMainnet is Script {
    uint256 constant FOUNDER_ALLOC = 100_000_000 ether; // 10%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%
    uint256 constant AIRDROP_ALLOC = 600_000_000 ether; // 60% (300 + 200 + 100)

    // Deployment output addresses — populated by run(), logged at the end.
    address internal _core;
    address internal _attestation;
    address internal _clauses;
    address internal _sellers;
    address internal _auction;
    address internal _fig;
    address internal _airdrop;
    address internal _batchVerifier;
    address internal _clauseHelper;
    address internal _offsetReceipts;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol();
        _deployAndRegisterValidators();
        _deployFigEcosystem(privateKey);
        _deployBatchVerifier();

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("SP1_VERIFIER") != address(0), "SP1_VERIFIER not set");
        require(vm.envBytes32("SP1_PROGRAM_VKEY") != bytes32(0), "SP1_PROGRAM_VKEY not set");
        require(vm.envBytes32("GENESIS_ROOT") != bytes32(0), "GENESIS_ROOT not set");
        require(vm.envBytes32("RPGF_PROGRAM_VKEY") != bytes32(0), "RPGF_PROGRAM_VKEY not set");
        require(vm.envAddress("RPGF_SUBMITTER") != address(0), "RPGF_SUBMITTER not set");
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y2") != 0, "AIRDROP_UNLOCK_Y2 not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y5") != 0, "AIRDROP_UNLOCK_Y5 not set");
        require(vm.envUint("AIRDROP_UNLOCK_Y9") != 0, "AIRDROP_UNLOCK_Y9 not set");
    }

    // ── Protocol kernel + extensions ────────────────────────────────

    function _deployProtocol() internal {
        FigaroCore core = new FigaroCore();
        _core = address(core);
        console.log("FigaroCore:             ", _core);

        AttestationCoordinator attestation = new AttestationCoordinator(_core);
        _attestation = address(attestation);
        console.log("AttestationCoordinator: ", _attestation);

        ClauseRegistry clauses = new ClauseRegistry();
        _clauses = address(clauses);
        console.log("ClauseRegistry:         ", _clauses);

        // Clauses are NOT registered here. Their content is pinned to IPFS +
        // anchored on ClauseRegistry by frontend/scripts/populate-clauses.mjs —
        // the single clause-population path for prod/testnet/mainnet, so each
        // on-chain (contentHash, metadataURI) points at a REAL pinned spec, not a
        // placeholder hash. The validators above are bound at deploy time
        // (clauseId hash → IClauseValidator); clause content registration is the
        // post-deploy population step. Run populate-clauses.mjs after broadcast.

        // ── SellerRegistry ────────────────────────────────────────
        // PLACEHOLDER VALUES — DO NOT SHIP TO MAINNET WITHOUT REVIEW.
        // The deposit + lock pair is the Sybil-resistance knob (see
        // SellerRegistry NatSpec on `depositLockPeriod`). Picking
        // mainnet values needs explicit reasoning recorded here:
        //   - registrationDeposit: $X target in ETH at deploy-time price?
        //     Bonded participation cost is the floor of attacker
        //     discouragement. Too low → cheap Sybil farms; too high →
        //     locks out small sellers.
        //   - depositLockPeriod: how long does an seller commit to a
        //     given role/metadata before they can withdraw + reassert?
        //     Every role/metadata change goes through withdraw +
        //     re-register (web2-strip 2026-04-26). Too short →
        //     deposits churn freely (Sybil mitigation weakens); too
        //     long → exit friction discourages legitimate sellers.
        // Devnet uses (0.001 ether, 365 days) as ergonomic defaults.
        // Replace these before mainnet broadcast.
        SellerRegistry sellers = new SellerRegistry(0.001 ether, 365 days);
        _sellers = address(sellers);
        console.log("SellerRegistry:       ", _sellers);

        DutchAuction auction = new DutchAuction(30 minutes, 2000);
        _auction = address(auction);
        console.log("DutchAuction:           ", _auction);

        // Atomic register-clause + bind-validator helper for post-deploy
        // clause authors. Closes the M-1 front-running window between the
        // two writes (DESIGN_DECISIONS.md #13). Stateless, no admin.
        ClauseRegistrationHelper clauseHelper = new ClauseRegistrationHelper(_clauses, _attestation);
        _clauseHelper = address(clauseHelper);
        console.log("ClauseRegistrationHelper:", _clauseHelper);

        // Permissionless on-chain anchor for Path A carbon-offset receipts.
        // Buyer calls record(processId, ...) after performing the off-protocol
        // retirement at an aggregator (Klima KlimaInfinity, Toucan
        // OffsetHelper); the contract verifies the caller is
        // processes[processId].rootBuyer and emits ReceiptRecorded with the
        // processId↔retirementTxHash binding. No state, no admin. Audit-bundle
        // reader queries the event log by processId. Separate primitive per
        // separation-of-concerns doctrine — receipts are not attestations
        // (no agreement clause, no inclusion proof) and get their own anchor.
        ProcessOffsetReceipt offsetReceipts = new ProcessOffsetReceipt(FigaroCore(_core));
        _offsetReceipts = address(offsetReceipts);
        console.log("ProcessOffsetReceipt:   ", _offsetReceipts);
    }

    // ── Clause validators ───────────────────────────────────────────

    /// @dev Deploy 17 per-clause runtime validators and register each with the
    ///      AttestationCoordinator via permissionless setValidator. The
    ///      coordinator enforces `validator.clauseId() == clauseId`, so any
    ///      cross-wired validator reverts InvalidValidatorBinding. Without
    ///      this step every attest* call reverts with ValidatorNotSet.
    ///
    ///      Topology is a manifest-only clause (contract-time, not runtime-
    ///      attested), so no on-chain validator is wired for `figaro-topology-v1`.
    ///      The clause itself remains registered in ClauseRegistry above for
    ///      off-chain vocabulary anchoring.
    function _deployAndRegisterValidators() internal {
        AttestationCoordinator attestation = AttestationCoordinator(_attestation);

        // Each validator is deployed + registered + logged in a single scope
        // to avoid holding more than one address on the Yul stack at a time.
        // Prevents stack-too-deep under `solc_via_ir` with many local vars.
        _wireValidator(attestation, "CommerceV1Validator:         ",
            keccak256(abi.encode("figaro-commerce", uint64(1))), address(new FigaroCommerceV1Validator()));
        _wireValidator(attestation, "GeoV1Validator:              ",
            keccak256(abi.encode("figaro-geo", uint64(1))), address(new FigaroGeoV1Validator()));
        _wireValidator(attestation, "ClassOfServiceValidator:     ",
            keccak256(abi.encode("figaro-class-of-service", uint64(1))), address(new FigaroClassOfServiceValidator()));
        _wireValidator(attestation, "ModalitiesV1Validator:       ",
            keccak256(abi.encode("figaro-modalities", uint64(1))), address(new FigaroModalitiesV1Validator()));
        _wireValidator(attestation, "CoordinationV1Validator:     ",
            keccak256(abi.encode("figaro-coordination", uint64(1))), address(new FigaroCoordinationV1Validator()));
        _wireValidator(attestation, "HandoffV1Validator:          ",
            keccak256(abi.encode("figaro-handoff", uint64(1))), address(new FigaroHandoffV1Validator()));
        _wireValidator(attestation, "GHGV1Validator:              ",
            keccak256(abi.encode("figaro-ghg", uint64(1))), address(new FigaroGHGV1Validator()));
        _wireValidator(attestation, "GHGMeasurementV1Validator:   ",
            keccak256(abi.encode("figaro-ghg-measurement", uint64(1))), address(new FigaroGHGMeasurementV1Validator()));
        _wireValidator(attestation, "ProximityPolicyV1Validator:  ",
            keccak256(abi.encode("figaro-proximity-policy", uint64(1))), address(new FigaroProximityPolicyV1Validator()));
        _wireValidator(attestation, "ProximityProofV1Validator:   ",
            keccak256(abi.encode("figaro-proximity-proof", uint64(1))), address(new FigaroProximityProofV1Validator()));
        _wireValidator(attestation, "MerchantProcessV1Validator: ",
            keccak256(abi.encode("figaro-merchant-process", uint64(1))), address(new FigaroMerchantProcessV1Validator()));
        _wireValidator(attestation, "CourierProcessV1Validator:     ",
            keccak256(abi.encode("figaro-courier-process", uint64(1))), address(new FigaroCourierProcessV1Validator()));
        _wireValidator(attestation, "ArbitrationKlerosV1Validator:  ",
            keccak256(abi.encode("figaro-arbitration-kleros", uint64(1))), address(new FigaroArbitrationKlerosV1Validator()));
        _wireValidator(attestation, "ApplicableLawV1Validator:      ",
            keccak256(abi.encode("figaro-applicable-law", uint64(1))), address(new FigaroApplicableLawV1Validator()));
        _wireValidator(attestation, "ConsentV1Validator:            ",
            keccak256(abi.encode("figaro-consent", uint64(1))), address(new FigaroConsentV1Validator()));
        _wireValidator(attestation, "OffsetPolicyV1Validator:       ",
            keccak256(abi.encode("figaro-offset-policy", uint64(1))), address(new FigaroOffsetPolicyV1Validator()));

        console.log("AttestationCoordinator: 16 validators wired");
    }

    function _wireValidator(
        AttestationCoordinator attestation,
        string memory label,
        bytes32 clauseId,
        address validator
    ) internal {
        attestation.setValidator(clauseId, validator);
        console.log(label, validator);
    }

    // ── FIG token + genesis distribution + staged airdrop ───────────

    function _deployFigEcosystem(uint256 privateKey) internal {
        FigToken fig = new FigToken();
        _fig = address(fig);
        console.log("FigToken:               ", _fig);

        // Build the RpgfMinter with three immutable unlock times. Per-tranche
        // roots and total allocations are submitted at tranche time by the
        // sequencer (RPGF_SUBMITTER) after an SP1 proof verifies the
        // aggregation. The 600M FigToken minter cap is the protocol-level
        // ceiling; per-stage budgets live in the off-chain aggregation logic.
        uint64[3] memory unlockTimes = [
            uint64(vm.envUint("AIRDROP_UNLOCK_Y2")),
            uint64(vm.envUint("AIRDROP_UNLOCK_Y5")),
            uint64(vm.envUint("AIRDROP_UNLOCK_Y9"))
        ];
        RpgfMinter airdrop = new RpgfMinter(
            _fig,
            vm.envAddress("SP1_VERIFIER"),
            vm.envBytes32("RPGF_PROGRAM_VKEY"),
            vm.envAddress("RPGF_SUBMITTER"),
            unlockTimes
        );
        _airdrop = address(airdrop);
        console.log("RpgfMinter:             ", _airdrop);

        // Genesis distribution: mint 100M + 300M directly to the founder and
        // DAO wallets. Register the deployer as a one-shot genesis minter with
        // cap exactly 400M so that this script is the ONLY entity that can ever
        // exercise deployer-side minting, and only for these two transfers.
        address deployer = vm.addr(privateKey);
        fig.registerMinter(deployer, FOUNDER_ALLOC + DAO_ALLOC);
        fig.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        fig.mint(vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        console.log("FigToken: genesis mint complete (founder + DAO)");

        // Register the RPGF minter as the sole remaining minter.
        fig.registerMinter(_airdrop, AIRDROP_ALLOC);
        console.log("FigToken: RpgfMinter registered as minter (600M cap)");

        // After renounce, no new minters can ever be registered and the deployer
        // cannot mint again. The 400M deployer cap is exactly exhausted at this
        // point; the 600M airdrop cap is the only remaining mint path.
        fig.renounceDeployerMint();
        console.log("FigToken: deployer mint renounced (permanent)");
    }

    // ── Batch verifier ───────────────────────────────────────────────

    function _deployBatchVerifier() internal {
        FigaroBatchVerifier bv = new FigaroBatchVerifier(
            vm.envAddress("SP1_VERIFIER"), vm.envBytes32("SP1_PROGRAM_VKEY"), vm.envBytes32("GENESIS_ROOT")
        );
        _batchVerifier = address(bv);
        console.log("FigaroBatchVerifier:    ", _batchVerifier);
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER=", _clauseHelper);
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=        ", _sellers);
        console.log("  NEXT_PUBLIC_DUTCH_AUCTION=            ", _auction);
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=        ", _fig);
        console.log("  NEXT_PUBLIC_RPGF_MINTER=              ", _airdrop);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=           ", _batchVerifier);
        console.log("  NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT=   ", _offsetReceipts);
        console.log("---");
    }
}
