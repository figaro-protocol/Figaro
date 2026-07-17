// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/FigaroCore.sol";
import "../src/AttestationCoordinator.sol";
import "../src/ClauseRegistry.sol";
import "../src/SellerRegistry.sol";
import "../src/florin/FlorinToken.sol";
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockWitnessPermit2.sol";
import "../src/mocks/MockUniversalRouter.sol";
import "../src/mocks/MockArbitrator.sol";
import "../src/mocks/MockTreasuryMultisig.sol";
import {RpgfMinter} from "../src/florin/RpgfMinter.sol";
import {DonationRail} from "../src/DonationRail.sol";
import "../src/mocks/MockSP1Verifier.sol";
import "../src/FigaroBatchVerifier.sol";
// Named import: the coordinator declares its own local-minimal `IFigaroCore`
// (the coordinator exemplar), which would collide with AttestationCoordinator's.
import {WitnessSwapAndCommitCoordinator} from "../src/WitnessSwapAndCommitCoordinator.sol";
import "../src/AssemblyRegistry.sol";

/// @title Deploy — Full protocol stack to local Anvil
/// @notice Deploys: FigaroCore, AttestationCoordinator, ClauseRegistry,
///         AssemblyRegistry, SellerRegistry, WitnessSwapAndCommitCoordinator
///         (+ MockWitnessPermit2 / MockUniversalRouter as its devnet Permit2 and
///         swap venue), FlorinToken, MockERC20, MockPermitToken.
///         Clauses are populated post-deploy (populate-clauses.mjs). Mints test
///         tokens to Anvil accounts.
///
///         Devnet florin allocation: 100M → deployer's wallet (stands in for founder
///         + DAO on devnet; the mainnet split is in script/DeployMainnet.s.sol),
///         plus the RpgfMinter registered at 600M before renounce — the
///         optimistic RPGF distribution (post/challenge/finalize/claim) is live
///         on devnet with seconds-scale windows and a MockArbitrator forum.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ── Mock tokens ─────────────────────────────────────────────
        MockERC20 token = new MockERC20("Mock Token", "MOCK");
        console.log("MockERC20 deployed at:", address(token));

        MockPermitToken permitToken = new MockPermitToken();
        console.log("MockPermitToken deployed at:", address(permitToken));

        // ── Core ────────────────────────────────────────────────────
        FigaroCore core = new FigaroCore();
        console.log("FigaroCore deployed at:", address(core));

        // ── AttestationCoordinator ──────────────────────────────────
        AttestationCoordinator attestation = new AttestationCoordinator(address(core));
        console.log("AttestationCoordinator deployed at:", address(attestation));

        // ── WitnessSwapAndCommitCoordinator ─────────────────────────
        // Off-protocol multi-token bond funding. Devnet composes it with a
        // mock Permit2 (witness-signature-verifying — digest parity with the
        // canonical deployment is proven by the mainnet-fork suite) and a
        // mock swap venue; mainnet uses the canonical Permit2 and the real
        // Uniswap Universal Router. The router is pre-funded with bond-token
        // liquidity so buyer legs can swap the permit token into the bond
        // currency at the mock's settable rate (1:1 default).
        MockWitnessPermit2 permit2 = new MockWitnessPermit2();
        console.log("MockWitnessPermit2 deployed at:", address(permit2));

        MockUniversalRouter router = new MockUniversalRouter();
        console.log("MockUniversalRouter deployed at:", address(router));

        WitnessSwapAndCommitCoordinator swapCoordinator =
            new WitnessSwapAndCommitCoordinator(address(core), address(permit2), address(router));
        console.log("WitnessSwapAndCommitCoordinator deployed at:", address(swapCoordinator));

        // Router liquidity in both devnet tokens, so either can be swap output.
        token.mint(address(router), 10_000_000 ether);
        permitToken.mint(address(router), 10_000_000 ether);

        // ── ClauseRegistry ──────────────────────────────────────────
        // Deposit = staked intent (K4): registering costs 0.001 ETH,
        // reclaimable via withdrawDeposit — which de-surfaces the clause.
        // No time lock; pollution is priced by deposit × time-surfaced.
        ClauseRegistry clauses = new ClauseRegistry(0.001 ether);
        console.log("ClauseRegistry deployed at:", address(clauses));

        // Clauses are NOT registered here. They are pinned to IPFS + anchored
        // on ClauseRegistry by frontend/scripts/populate-clauses.mjs — the single
        // clause-population path for prod/testnet/mainnet, so each on-chain
        // (contentHash, contentURI) points at a REAL pinned spec (not a
        // placeholder). Run it after deploy.
        //
        // There is NO on-chain clause-content validation: the chain binds an
        // attestation to its signed agreement (merkle inclusion) and to its
        // content (keccak256). Content well-formedness is the off-chain SDK's
        // job (honest authors) and a read-time concern (downstream forums
        // reject garbage). Any registered clause is attestable with no
        // per-clause on-chain code — open-world by construction.

        // ── AssemblyRegistry ────────────────────────────────────────
        // Permissionless first-write-wins anchor for designer-built
        // assemblies. Parallel to ClauseRegistry and SellerRegistry —
        // each artifact family has its own registry per the
        // separation-of-concerns doctrine. The registry takes no on-chain
        // claims about agreement content (agreements live off-chain on
        // IPFS); per-clause validation runs at the per-clause layer
        // at attestation time.
        //
        // Spam protection via reclaimable deposit — same pattern
        // SellerRegistry uses but adapted: withdraw returns the ETH and
        // de-surfaces the assembly, but the composition binding stays
        // permanently because buyers and sellers rely on content stability.
        // No time lock (K4): pollution costs deposit × time-surfaced.
        //
        // Devnet value: 0.001 ETH deposit so test wallets can register
        // without faucet drama. Mainnet picks its own value via
        // DeployMainnet.s.sol — record the reasoning there.
        AssemblyRegistry assemblies = new AssemblyRegistry(0.001 ether);
        console.log("AssemblyRegistry deployed at:", address(assemblies));

        // ── SellerRegistry ────────────────────────────────────────
        // Deposit chosen for devnet ergonomics: 0.001 ETH so test wallets
        // can register without faucet drama. No time lock (K4): withdraw
        // de-surfaces the seller, so recycling a deposit across identities
        // costs surfacing time, not calendar time.
        // Mainnet picks its own value via DeployMainnet.s.sol — record
        // the reasoning there.
        SellerRegistry sellers = new SellerRegistry(0.001 ether);
        console.log("SellerRegistry deployed at:", address(sellers));

        // ── Batch-settlement proof path (mock verifier on devnet) ──
        // MockSP1Verifier accepts any proof; the real deployment wires
        // Succinct's SP1 verifier gateway + the program vkey from
        // `SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release`
        // (DeployMainnet.s.sol). The genesis root is DERIVED — one
        // keccak256("") per kernel state map (processes, orderStatus,
        // orderProcessId), matching the Rust KernelState::compute_root
        // on the empty state. ClauseRegistry is the witness-spec anchor:
        // settleBatch checks each proof's (clause key → spec hash)
        // binding against contentHashOf before settling.
        // Note: FigaroBatchVerifier is NOT a florin minter and never will be.
        _deployBatchVerifier(address(clauses));

        // ── florin token + RPGF minter ─────────────────────────────────
        FlorinToken florin = new FlorinToken();
        console.log("FlorinToken deployed at:", address(florin));

        // The RPGF minter must exist AT GENESIS: FlorinToken.registerMinter only
        // works before renounceDeployerMint, and renounce is irreversible —
        // so the optimistic 600M distribution registers here, before any
        // other genesis step. The composed bond-settlement forum is a mock on
        // devnet (a real deployment composes an arbitration provider behind
        // the same IRpgfArbitrator seam). formulaHash anchors the exact bytes
        // of the canonical formula spec so any observer can recompute posted
        // roots. Devnet windows are seconds, not days, so the e2e suite can
        // run the full post -> challenge -> finalize -> claim cycle in real
        // time (testnet compresses years 2/5/9 to weeks; devnet compresses
        // further to now/+14d/+35d with 20s windows).
        _deployRpgf(florin);

        _deployTreasuryGenesis(florin, vm.addr(deployerPrivateKey));

        _deployDonationRail();

        // ── Mint test tokens to Anvil accounts ──────────────────────
        // anvil[0..19] — all 20 accounts minted EXPLICITLY. The deployer is
        // a randomized throwaway key (deploy-local.sh), so no anvil account
        // inherits the constructor mint; anvil[0] is funded here like every
        // other index. anvil must launch with `--accounts 20` so these
        // indices also hold ETH for gas (see scripts/devup.sh). Headroom
        // for per-scenario dedicated sellers beyond the original anvil[5..9].
        address[20] memory testAccounts = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc,
            0x976EA74026E726554dB657fA54763abd0C3a0aa9,
            0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
            0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
            0xa0Ee7A142d267C1f36714E4a8F75612F20a79720,
            0xBcd4042DE499D14e55001CcbB24a551F3b954096,
            0x71bE63f3384f5fb98995898A86B02Fb2426c5788,
            0xFABB0ac9d68B0B445fB7357272Ff202C5651694a,
            0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec,
            0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097,
            0xcd3B766CCDd6AE721141F452C550Ca635964ce71,
            0x2546BcD3c84621e976D8185a91A922aE77ECEc30,
            0xbDA5747bFD65F08deb54cb465eB87D40e51B197E,
            0xdD2FD4581271e230360230F9337D5c0430Bf44C0,
            0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199
        ];
        for (uint256 i = 0; i < testAccounts.length; i++) {
            token.mint(testAccounts[i], 100_000 ether);
            permitToken.mint(testAccounts[i], 100_000 ether);
        }
        console.log("Minted test tokens to Anvil accounts [0]-[19]");

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete. Addresses:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=", address(core));
        console.log("  NEXT_PUBLIC_TOKEN_ADDRESS=", address(token));
        console.log("  NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=", address(permitToken));
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=", address(attestation));
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", address(swapCoordinator));
        console.log("  NEXT_PUBLIC_PERMIT2=", address(permit2));
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", address(router));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=", address(clauses));
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=", address(sellers));
        console.log("  NEXT_PUBLIC_ASSEMBLY_REGISTRY=", address(assemblies));
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=", address(florin));
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=", _batchVerifier);
    }

    address internal _batchVerifier;

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    function _deployBatchVerifier(address clauseRegistry) internal {
        MockSP1Verifier mockSp1 = new MockSP1Verifier();
        console.log("MockSP1Verifier deployed at:", address(mockSp1));
        bytes32 emptyMapHash = keccak256("");
        FigaroBatchVerifier batchVerifier = new FigaroBatchVerifier(
            address(mockSp1),
            keccak256(abi.encodePacked("figaro-kernel-dev")),
            clauseRegistry,
            keccak256(abi.encodePacked(emptyMapHash, emptyMapHash, emptyMapHash))
        );
        _batchVerifier = address(batchVerifier);
        console.log("FigaroBatchVerifier deployed at:", _batchVerifier);
    }

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    ///      Devnet genesis mint, rehearsing the mainnet 10/30/60 custody
    ///      shape: 100M founder stand-in to the deployer, 300M DAO to a
    ///      treasury MULTISIG (mainnet: a canonical Safe at DAO_WALLET —
    ///      config, never code; devnet: MockTreasuryMultisig with anvil[0..2]
    ///      as 2-of-3 placeholder owners, per the anvil-placeholder ruling).
    ///      The DAO buys through a per-procurement funded operator-EOA — the
    ///      treasury itself never signs kernel commitments (the kernel is
    ///      ECDSA-only).
    function _deployTreasuryGenesis(FlorinToken florin, address deployer) internal {
        address[] memory treasuryOwners = new address[](3);
        treasuryOwners[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // anvil[0]
        treasuryOwners[1] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // anvil[1]
        treasuryOwners[2] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // anvil[2]
        MockTreasuryMultisig daoTreasury = new MockTreasuryMultisig(treasuryOwners, 2);
        console.log("MockTreasuryMultisig deployed at:", address(daoTreasury));

        florin.registerMinter(deployer, 400_000_000 ether);
        florin.mint(deployer, 100_000_000 ether);
        florin.mint(address(daoTreasury), 300_000_000 ether);

        florin.renounceDeployerMint();
        console.log("Deployer mint renounced");
        console.log("  NEXT_PUBLIC_DAO_TREASURY=", address(daoTreasury));
    }

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    ///      The no-custody donation event surface for crowd-steered match
    ///      rounds: a permissionless singleton like the registries. Match
    ///      pools (OptimisticMatchPool) are NOT genesis contracts — one
    ///      instance IS one round, deployed by whoever opens the round and
    ///      pointed at this rail (the e2e suite deploys its own per run).
    function _deployDonationRail() internal {
        DonationRail donationRail = new DonationRail();
        console.log("DonationRail deployed at:", address(donationRail));
        console.log("  NEXT_PUBLIC_DONATION_RAIL=", address(donationRail));
    }

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    ///      Logs its own address lines — deploy-local.sh parses the
    ///      "deployed at:" lines, and the NEXT_PUBLIC_ summary for these two
    ///      prints here rather than in run().
    function _deployRpgf(FlorinToken florin) internal {
        MockArbitrator rpgfArbitrator = new MockArbitrator();
        console.log("MockArbitrator deployed at:", address(rpgfArbitrator));

        bytes32 formulaHash = keccak256(bytes(vm.readFile("sdk/src/rpgf/formula.json")));
        RpgfMinter rpgfMinter = new RpgfMinter(
            address(florin),
            address(rpgfArbitrator),
            formulaHash,
            0.05 ether, // post/challenge bond — devnet-sized
            20, // challenge window (seconds)
            20, // dispute window (seconds)
            [uint64(block.timestamp), uint64(block.timestamp + 14 days), uint64(block.timestamp + 35 days)],
            [uint256(300_000_000 ether), 200_000_000 ether, 100_000_000 ether]
        );
        console.log("RpgfMinter deployed at:", address(rpgfMinter));
        florin.registerMinter(address(rpgfMinter), 600_000_000 ether);
    }
}
