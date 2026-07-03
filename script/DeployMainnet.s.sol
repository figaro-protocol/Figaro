// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/FigaroCore.sol";
import "../src/AttestationCoordinator.sol";
import "../src/ClauseRegistry.sol";
import "../src/SellerRegistry.sol";
import "../src/fig/FigToken.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro V5 protocol stack
///
/// @notice Deploys all production contracts with no mocks. All security-sensitive
///         parameters are read from environment variables so they can be verified
///         independently before broadcast.
///
/// Required environment variables:
///   PRIVATE_KEY                — deployer private key (or use hardware wallet via flags)
///   FOUNDER_WALLET             — address receiving the 100M founder allocation at genesis
///   DAO_WALLET                 — address receiving the 300M DAO allocation at genesis
///
/// FIG allocation (1B cap):
///   100M  (10%)  founders — genesis mint to FOUNDER_WALLET (no vesting, no unlock)
///   300M  (30%)  DAO      — genesis mint to DAO_WALLET     (no vesting, no unlock)
///   The proof-gated 600M RPGF airdrop (RpgfMinter + its SP1 prover) was removed
///   in the proof-apparatus teardown. Only the 400M founder + DAO genesis mints
///   are minted here; the remaining 600M of the cap has no wired mint path.
///
/// @dev There is NO on-chain clause-content validation and NO batch settlement
///      proof path. The chain binds an attestation to its signed agreement
///      (merkle inclusion) and to its content (keccak256); content well-formedness
///      is an off-chain SDK / read-time concern. Any registered clause is
///      attestable with no per-clause on-chain code.
///
/// @dev Deployer renounces minting rights at the end of this script. No new minters
///      can ever be registered afterward.
contract DeployMainnet is Script {
    uint256 constant FOUNDER_ALLOC = 100_000_000 ether; // 10%
    uint256 constant DAO_ALLOC = 300_000_000 ether; // 30%

    // Deployment output addresses — populated by run(), logged at the end.
    address internal _core;
    address internal _attestation;
    address internal _clauses;
    address internal _sellers;
    address internal _fig;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        _validateEnv();

        vm.startBroadcast(privateKey);

        _deployProtocol();
        _deployFigEcosystem(privateKey);

        vm.stopBroadcast();

        _logAddresses();
    }

    // ── Environment validation ───────────────────────────────────────

    function _validateEnv() internal view {
        require(vm.envAddress("FOUNDER_WALLET") != address(0), "FOUNDER_WALLET not set");
        require(vm.envAddress("DAO_WALLET") != address(0), "DAO_WALLET not set");
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
        // placeholder hash. There is no per-clause on-chain validator to bind:
        // the chain merkle-binds and content-hash-binds attestations and does not
        // validate content shape. Run populate-clauses.mjs after broadcast.

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
    }

    // ── FIG token + genesis distribution ────────────────────────────

    function _deployFigEcosystem(uint256 privateKey) internal {
        FigToken fig = new FigToken();
        _fig = address(fig);
        console.log("FigToken:               ", _fig);

        // Genesis distribution: mint 100M + 300M directly to the founder and
        // DAO wallets. Register the deployer as a one-shot genesis minter with
        // cap exactly 400M so that this script is the ONLY entity that can ever
        // exercise deployer-side minting, and only for these two transfers.
        address deployer = vm.addr(privateKey);
        fig.registerMinter(deployer, FOUNDER_ALLOC + DAO_ALLOC);
        fig.mint(vm.envAddress("FOUNDER_WALLET"), FOUNDER_ALLOC);
        fig.mint(vm.envAddress("DAO_WALLET"), DAO_ALLOC);
        console.log("FigToken: genesis mint complete (founder + DAO)");

        // After renounce, no new minters can ever be registered and the deployer
        // cannot mint again. The 400M deployer cap is exactly exhausted at this
        // point; the remaining 600M of the 1B cap has no wired mint path (the
        // proof-gated RPGF airdrop was removed).
        fig.renounceDeployerMint();
        console.log("FigToken: deployer mint renounced (permanent)");
    }

    // ── Address summary ──────────────────────────────────────────────

    function _logAddresses() internal view {
        console.log("---");
        console.log("Set these in your .env:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=              ", _core);
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=  ", _attestation);
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=          ", _clauses);
        console.log("  NEXT_PUBLIC_SELLER_REGISTRY=        ", _sellers);
        console.log("  NEXT_PUBLIC_FIG_TOKEN_ADDRESS=        ", _fig);
        console.log("---");
    }
}
