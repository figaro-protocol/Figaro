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
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockOffsetAggregator.sol";
import "../src/mocks/MockERC20.sol";
import "../src/AssemblyRegistry.sol";
import "../src/ProcessOffsetReceipt.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Deploy — Full protocol stack to local Anvil
/// @notice Deploys: FigaroCore, AttestationCoordinator, ClauseRegistry,
///         AssemblyRegistry, SellerRegistry, DutchAuction, FigToken,
///         ProcessOffsetReceipt, MockERC20, MockPermitToken, MockOffsetAggregator.
///         Clauses are populated post-deploy (populate-clauses.mjs). Mints test
///         tokens to Anvil accounts.
///
///         Devnet FIG allocation: 100M → deployer's wallet (stands in for founder
///         + DAO on devnet; the mainnet split is in script/DeployMainnet.s.sol).
///         The proof-gated RPGF airdrop was removed in the proof-apparatus
///         teardown, so there is no staged-airdrop allocation on either path.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ── Mock tokens ─────────────────────────────────────────────
        MockERC20 token = new MockERC20("Mock Token", "MOCK");
        console.log("MockERC20 deployed at:", address(token));

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

        // Clauses are NOT registered here. They are pinned to IPFS + anchored
        // on ClauseRegistry by frontend/scripts/populate-clauses.mjs — the single
        // clause-population path for prod/testnet/mainnet, so each on-chain
        // (contentHash, metadataURI) points at a REAL pinned spec (not a
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
        // Devnet genesis mint: 100M to deployer. The proof-gated RPGF
        // distribution (RpgfMinter + its SP1 prover) was removed in the
        // proof-apparatus teardown; FIG ships with no wired distribution
        // minter on devnet beyond this genesis allocation.
        address deployer = vm.addr(deployerPrivateKey);
        fig.registerMinter(deployer, 100_000_000 ether);
        fig.mint(deployer, 100_000_000 ether);

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
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=", address(clauses));
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=", address(sellers));
        console.log("  NEXT_PUBLIC_ASSEMBLY_REGISTRY=", address(assemblies));
        console.log("  NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT=", address(offsetReceipts));
        console.log("  NEXT_PUBLIC_DUTCH_AUCTION=", address(auction));
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=", address(fig));
    }
}
