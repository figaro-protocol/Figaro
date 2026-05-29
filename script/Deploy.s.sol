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
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/mocks/MockOffsetAggregator.sol";
import "../src/FigaroBatchVerifier.sol";
import "../src/ClauseRegistrationHelper.sol";
import "../src/clauseValidators/FigaroCommerceV1Validator.sol";
import "../src/clauseValidators/FigaroGeoV2Validator.sol";
import "../src/clauseValidators/FigaroFulfilmentV2Validator.sol";
import "../src/clauseValidators/FigaroGHGProtocolV1Validator.sol";
import "../src/clauseValidators/FigaroGHGISO14064V1Validator.sol";
import "../src/clauseValidators/FigaroGHGPAS2050V1Validator.sol";
import "../src/clauseValidators/FigaroGHGEN16258V1Validator.sol";
import "../src/clauseValidators/FigaroGHGCustomV1Validator.sol";
import "../src/clauseValidators/FigaroGHGMeasurementV1Validator.sol";
import "../src/clauseValidators/FigaroProximityPolicyV1Validator.sol";
import "../src/clauseValidators/FigaroOffsetPolicyV1Validator.sol";
import "../src/clauseValidators/FigaroProximityProofV1Validator.sol";
import "../src/clauseValidators/FigaroMerchantProcessV1Validator.sol";
import "../src/clauseValidators/FigaroCourierProcessV1Validator.sol";
import "../src/clauseValidators/FigaroArbitrationKlerosV1Validator.sol";
import "../src/clauseValidators/FigaroApplicableLawV1Validator.sol";
import "../src/clauseValidators/FigaroConsentV1Validator.sol";
import "../src/AssemblyRegistry.sol";
import "../src/ProcessOffsetReceipt.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal mock token for local dev.
contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title Deploy — Full protocol stack to local Anvil
/// @notice Deploys: FigaroCore, AttestationCoordinator, ClauseRegistry,
///         SellerRegistry, DutchAuction, FigToken, MockToken, MockPermitToken.
///         Registers reference clauses. Mints test tokens to Anvil accounts.
///
///         Devnet FIG allocation (mirrors canonical 10/30/60 shape at token scale):
///           100M (10%) → deployer's wallet (stands in for founder + DAO + airdrop
///                                            placeholders on devnet; staged airdrop
///                                            and dedicated wallets are mainnet-only).
///           The canonical allocation (100M founder / 300M DAO / 600M staged airdrop
///           at yr 2/5/9) is realized in script/DeployMainnet.s.sol.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ── Mock tokens ─────────────────────────────────────────────
        MockToken token = new MockToken();
        console.log("MockToken deployed at:", address(token));

        MockPermitToken permitToken = new MockPermitToken();
        console.log("MockPermitToken deployed at:", address(permitToken));

        // ── MockOffsetAggregator ────────────────────────────────────
        // Devnet stand-in for Klima's KlimaInfinity diamond / Toucan's
        // OffsetHelper. Real aggregators are external contracts on Polygon
        // (chainId 137); this mock stands at chainId 31337 (Anvil) so the
        // bridge's four-step flow (approve → retire → attest → resolve)
        // can be exercised end-to-end without a Polygon connection. Price
        // is fixed at 0.01 MOCK per tonne — round number for hand-tracing
        // bond + cost math during e2e.
        MockOffsetAggregator offsetAggregator = new MockOffsetAggregator(IERC20(address(token)), 0.01 ether);
        console.log("MockOffsetAggregator deployed at:", address(offsetAggregator));

        // ── Core ────────────────────────────────────────────────────
        FigaroCore core = new FigaroCore();
        console.log("FigaroCore deployed at:", address(core));

        // ── AttestationCoordinator ──────────────────────────────────
        AttestationCoordinator attestation = new AttestationCoordinator(address(core));
        console.log("AttestationCoordinator deployed at:", address(attestation));

        // ── ClauseRegistry ──────────────────────────────────────────
        ClauseRegistry clauses = new ClauseRegistry();
        console.log("ClauseRegistry deployed at:", address(clauses));

        // Register reference clauses (18 figaro-* clauses: 17 runtime-attestable + figaro-topology-v1 manifest-only).
        // The 4th argument is the family — keccak256 of the primary category from each clause's
        // Layer-A spec (categories[0] in frontend/lib/shared/clauses/*.json). The RPGF SP1 program
        // reads `family` (not `clauseId`) to decide Tier-1 weighting — see prover/rpgf/src/formula.rs.
        // Tier-1 families are {keccak256("geo"), keccak256("fulfilment")}; new clauses registering
        // under those families inherit the Tier-1 boost without redeploying the FIG system.
        clauses.registerClause(
            keccak256("figaro-topology-v1"), 1, keccak256("ipfs://figaro-topology/v1"), keccak256("topology")
        );
        clauses.registerClause(
            keccak256("figaro-commerce-v1"), 1, keccak256("ipfs://figaro-commerce/v1"), keccak256("commerce")
        );
        clauses.registerClause(
            keccak256("figaro-geo-v2"), 1, keccak256("ipfs://figaro-geo/v2"), keccak256("geo")
        );
        clauses.registerClause(
            keccak256("figaro-fulfilment-v2"), 1, keccak256("ipfs://figaro-fulfilment/v2"), keccak256("fulfilment")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-protocol-v1"), 1, keccak256("ipfs://figaro-ghg-protocol/v1"), keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-iso-14064-v1"),
            1,
            keccak256("ipfs://figaro-ghg-iso-14064/v1"),
            keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-pas-2050-v1"), 1, keccak256("ipfs://figaro-ghg-pas-2050/v1"), keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-en-16258-v1"), 1, keccak256("ipfs://figaro-ghg-en-16258/v1"), keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-custom-v1"), 1, keccak256("ipfs://figaro-ghg-custom/v1"), keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-ghg-measurement-v1"),
            1,
            keccak256("ipfs://figaro-ghg-measurement/v1"),
            keccak256("emissions")
        );
        clauses.registerClause(
            keccak256("figaro-proximity-policy-v1"),
            1,
            keccak256("ipfs://figaro-proximity-policy/v1"),
            keccak256("proximity")
        );
        clauses.registerClause(
            keccak256("figaro-proximity-proof-v1"),
            1,
            keccak256("ipfs://figaro-proximity-proof/v1"),
            keccak256("proximity")
        );
        clauses.registerClause(
            keccak256("figaro-merchant-process-v1"),
            1,
            keccak256("ipfs://figaro-merchant-process/v1"),
            keccak256("seller-process")
        );
        clauses.registerClause(
            keccak256("figaro-courier-process-v1"),
            1,
            keccak256("ipfs://figaro-courier-process/v1"),
            keccak256("seller-process")
        );
        clauses.registerClause(
            keccak256("figaro-arbitration-kleros-v1"),
            1,
            keccak256("ipfs://figaro-arbitration-kleros/v1"),
            keccak256("arbitration")
        );
        clauses.registerClause(
            keccak256("figaro-applicable-law-v1"),
            1,
            keccak256("ipfs://figaro-applicable-law/v1"),
            keccak256("jurisdiction")
        );
        clauses.registerClause(
            keccak256("figaro-consent-v1"), 1, keccak256("ipfs://figaro-consent/v1"), keccak256("consent")
        );
        clauses.registerClause(
            keccak256("figaro-offset-policy-v1"),
            1,
            keccak256("ipfs://figaro-offset-policy/v1"),
            keccak256("emissions")
        );
        console.log("Registered 18 reference clauses");

        // ── Clause validators ───────────────────────────────────────
        // Deploy per-clause validator contracts and wire them into the
        // AttestationCoordinator. Without this block every attest* call reverts
        // with ValidatorNotSet. First-write-wins — run only on a fresh coordinator.
        _deployAndRegisterValidators(attestation);

        // ── ClauseRegistrationHelper ────────────────────────────────
        // Atomic register-clause + bind-validator helper for post-deploy
        // clause authors. Closes the M-1 front-running window between the
        // two writes (see DESIGN_DECISIONS.md #13). No state, no admin —
        // just a permissionless composer of the two underlying public calls.
        ClauseRegistrationHelper clauseHelper = new ClauseRegistrationHelper(
            address(clauses),
            address(attestation)
        );
        console.log("ClauseRegistrationHelper deployed at:", address(clauseHelper));

        // ── AssemblyRegistry ────────────────────────────────────────
        // Permissionless first-write-wins anchor for designer-built
        // assemblies. Parallel to ClauseRegistry and SellerRegistry —
        // each artifact family has its own registry per the
        // separation-of-concerns doctrine. The registry takes no on-chain
        // claims about manifest content (manifests live off-chain on
        // IPFS); per-clause validation runs at the per-clause layer
        // at attestation time.
        //
        // Spam protection via reclaimable deposit + lock — same pattern
        // SellerRegistry uses but adapted: withdraw returns the ETH
        // after the lock period, but the slug binding stays permanently
        // because buyers and sellers rely on slug stability.
        //
        // Devnet values:
        //   - 0.001 ETH deposit so test wallets can register without
        //     faucet drama;
        //   - 3 years (1,095 days) lock to make recycling deposits
        //     across spam registrations expensive in time as well as
        //     capital.
        // Mainnet picks its own values via DeployMainnet.s.sol — record
        // the reasoning there.
        AssemblyRegistry assemblies = new AssemblyRegistry(0.001 ether, 1095 days);
        console.log("AssemblyRegistry deployed at:", address(assemblies));

        // ── SellerRegistry ────────────────────────────────────────
        // Deposit + lock chosen for devnet ergonomics:
        //   - 0.001 ETH so test wallets can register without faucet drama;
        //   - 365 days so the lock is non-trivial enough that local devs
        //     experience the "switching role/metadata is irreversible for
        //     a year" UX before real deploys.
        // Mainnet picks its own values via DeployMainnet.s.sol — record
        // the reasoning there.
        SellerRegistry sellers = new SellerRegistry(0.001 ether, 365 days);
        console.log("SellerRegistry deployed at:", address(sellers));

        // ── DutchAuction ────────────────────────────────────────────
        DutchAuction auction = new DutchAuction(
            30 minutes, // duration
            2000 // 20% floor
        );
        console.log("DutchAuction deployed at:", address(auction));

        // ── FIG Token ───────────────────────────────────────────────
        FigToken fig = new FigToken();
        console.log("FigToken deployed at:", address(fig));

        // Devnet genesis mint: 100M to deployer as a simplified placeholder
        // for testing. Mainnet performs the 10/30/60 canonical distribution
        // in DeployMainnet.s.sol.
        address deployer = vm.addr(deployerPrivateKey);
        fig.registerMinter(deployer, 100_000_000 ether);
        fig.mint(deployer, 100_000_000 ether);

        // ── RpgfMinter (devnet test fixture) ────────────────────────
        // Single shared MockSP1Verifier — reused for both the RpgfMinter
        // and the FigaroBatchVerifier below. The mock accepts any proof
        // bytes (chainid-gated to Anvil/31337).
        MockSP1Verifier mockVerifier = new MockSP1Verifier();
        console.log("MockSP1Verifier deployed at:", address(mockVerifier));

        // RpgfMinter: on mainnet the root is submitted at tranche time
        // after an SP1 proof attests it correctly aggregates the
        // substrate-broadening formula. On devnet all three stages
        // unlock at genesis (unlockTime = 1), the deployer doubles as
        // submitter, and we immediately submit a single-leaf root for
        // the deployer with claim amount 1 ether so /fig/claim works
        // without time-travel or external sequencer wiring.
        //
        // Register BEFORE renounceDeployerMint — minters can't be added
        // after renounce per FigToken.sol:48. Cap math: 100M deployer +
        // 600M airdrop = 700M ≤ 1B MAX_SUPPLY.
        uint64[3] memory rpgfUnlocks = [uint64(1), uint64(1), uint64(1)];
        bytes32 devProgramVKey = keccak256("figaro-rpgf-dev");
        RpgfMinter airdrop =
            new RpgfMinter(address(fig), address(mockVerifier), devProgramVKey, deployer, rpgfUnlocks);
        fig.registerMinter(address(airdrop), 600_000_000 ether);
        console.log("RpgfMinter deployed at:", address(airdrop));

        // Submit a stage-0 root for the deployer (single-leaf tree:
        // leaf == root, empty proof verifies). Mock verifier accepts
        // any proof bytes. Lets /fig/claim work end-to-end on devnet
        // without spinning up an external sequencer.
        uint256 airdropClaimAmount = 1 ether;
        bytes32 airdropLeaf = keccak256(abi.encodePacked(deployer, airdropClaimAmount));
        bytes memory rpgfPublicValues = abi.encode(uint8(0), airdropLeaf, airdropClaimAmount, uint32(1));
        airdrop.submitRoot(rpgfPublicValues, hex"");
        console.log("RpgfMinter: stage-0 root submitted (devnet fixture)");

        fig.renounceDeployerMint();
        console.log("Deployer mint renounced");

        // ── ProcessOffsetReceipt ────────────────────────────────────
        // Permissionless on-chain anchor for Path A carbon-offset receipts.
        // Buyer calls record(processId, ...) after performing the off-protocol
        // retirement at an aggregator (Klima / Toucan / mock on devnet); the
        // contract verifies the caller is processes[processId].rootBuyer and
        // emits ReceiptRecorded(processId, buyer, retirementTxHash, ...). No
        // state, no admin. Audit-bundle reader queries the event log by
        // processId. Separate primitive per separation-of-concerns doctrine —
        // receipts are not attestations (no agreement clause, no inclusion
        // proof) and get their own anchor.
        ProcessOffsetReceipt offsetReceipts = new ProcessOffsetReceipt(core);
        console.log("ProcessOffsetReceipt deployed at:", address(offsetReceipts));

        // ── BatchVerifier (SP1 — mock verifier for devnet) ──────────
        // Genesis root = keccak256 of 5 concatenated keccak256("")
        // sub-hashes — empty processes, order_status, order_process_id,
        // clauses, sellers maps. Matches the Rust kernel's
        // KernelState::new().compute_root().
        //
        // Note: FigaroBatchVerifier is NOT a FIG minter and never will be.
        // Settlement-anchored FIG emission was removed from the kernel.
        bytes32 genesisRoot = 0x826c6f22e4362b1b34f080cc37deab3358df5d98592fd19534c28c1fb713fd8c;
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            address(mockVerifier),
            keccak256("figaro-kernel-dev"), // devnet program vKey
            genesisRoot
        );
        console.log("FigaroBatchVerifier deployed at:", address(batchVerifier));

        // ── Mint test tokens to Anvil accounts ──────────────────────
        address[9] memory testAccounts = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc,
            0x976EA74026E726554dB657fA54763abd0C3a0aa9,
            0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
            0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
            0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
        ];
        for (uint256 i = 0; i < testAccounts.length; i++) {
            token.mint(testAccounts[i], 100_000 ether);
            permitToken.mint(testAccounts[i], 100_000 ether);
        }
        console.log("Minted test tokens to Anvil accounts [1]-[9]");

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete. Addresses:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=", address(core));
        console.log("  NEXT_PUBLIC_TOKEN_ADDRESS=", address(token));
        console.log("  NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=", address(permitToken));
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=", address(attestation));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=", address(clauses));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER=", address(clauseHelper));
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=", address(sellers));
        console.log("  NEXT_PUBLIC_ASSEMBLY_REGISTRY=", address(assemblies));
        console.log("  NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT=", address(offsetReceipts));
        console.log("  NEXT_PUBLIC_DUTCH_AUCTION=", address(auction));
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=", address(fig));
        console.log("  NEXT_PUBLIC_RPGF_MINTER=", address(airdrop));
        // console.log(
        //     "  NEXT_PUBLIC_FIG_EMISSION_ADDRESS=",
        // );
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=", address(batchVerifier));
    }

    /// @dev Deploy 10 per-clause validators and register each with the
    ///      AttestationCoordinator via permissionless setValidator. The
    ///      coordinator enforces `validator.clauseId() == clauseId`, so any
    ///      cross-wired validator reverts InvalidValidatorBinding.
    function _deployAndRegisterValidators(AttestationCoordinator attestation) internal {
        // Topology is a manifest-only clause (contract-time, not runtime-attested),
        // so no on-chain validator is wired for `figaro-topology-v1`. The clause
        // itself remains registered in ClauseRegistry above for off-chain
        // vocabulary anchoring.
        //
        // Each deploy+register is inlined into a single statement so no more
        // than one validator address is live on the Yul stack at a time.
        // Avoids stack-too-deep under `solc_via_ir`.
        attestation.setValidator(
            keccak256("figaro-commerce-v1"), address(new FigaroCommerceV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-geo-v2"), address(new FigaroGeoV2Validator())
        );
        attestation.setValidator(
            keccak256("figaro-fulfilment-v2"), address(new FigaroFulfilmentV2Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-protocol-v1"), address(new FigaroGHGProtocolV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-iso-14064-v1"), address(new FigaroGHGISO14064V1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-pas-2050-v1"), address(new FigaroGHGPAS2050V1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-en-16258-v1"), address(new FigaroGHGEN16258V1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-custom-v1"), address(new FigaroGHGCustomV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-ghg-measurement-v1"), address(new FigaroGHGMeasurementV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-proximity-policy-v1"), address(new FigaroProximityPolicyV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-proximity-proof-v1"), address(new FigaroProximityProofV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-merchant-process-v1"), address(new FigaroMerchantProcessV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-courier-process-v1"), address(new FigaroCourierProcessV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-arbitration-kleros-v1"), address(new FigaroArbitrationKlerosV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-applicable-law-v1"), address(new FigaroApplicableLawV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-consent-v1"), address(new FigaroConsentV1Validator())
        );
        attestation.setValidator(
            keccak256("figaro-offset-policy-v1"), address(new FigaroOffsetPolicyV1Validator())
        );
        console.log("Registered 17 clause validators with AttestationCoordinator");
    }
}
