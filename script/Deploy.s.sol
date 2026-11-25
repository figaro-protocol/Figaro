// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {DeployBase} from "./DeployBase.s.sol";
import "../src/mocks/MockPermitToken.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockWitnessPermit2.sol";
import "../src/mocks/MockSwapVenue.sol";
import "../src/mocks/MockTreasuryMultisig.sol";
import "../src/mocks/MockSP1Verifier.sol";
import {MockDisperse} from "../src/mocks/MockDisperse.sol";

/// @title Deploy — Full protocol stack to local Anvil
/// @notice Deploys: FigaroCore, AttestationCoordinator, ClauseRegistry,
///         ProcessRegistry, AgreementRegistry, MembersRegistry, WitnessSwapAndCommitCoordinator
///         (+ MockWitnessPermit2 / MockSwapVenue as its devnet Permit2 and
///         swap venue), FlorinToken, MockERC20, MockPermitToken.
///         Clauses are populated post-deploy (populate-clauses.mjs). Mints test
///         tokens to Anvil accounts.
///
///         Devnet florin allocation: 100M → deployer's wallet (stands in for
///         founder + supporters on devnet; the public networks split it into
///         FOUNDER_WALLET 70M and SUPPORTERS_WALLET 30M), plus UsageCounter +
///         the RpgfMinter registered at 600M before renounce. Nothing is posted,
///         bonded, or challenged: the counter records verified usage as it
///         happens and the minter pays pro rata from a period that has closed.
///         Devnet runs the same nine annual periods as every public network; a
///         test that needs a closed period advances the chain's clock past the
///         open period's end.
///
///         The deployment is `DeployBase` (script/DeployBase.s.sol), the one
///         every chain runs: the registries, the counter↔verifier pair, the
///         schedule, the minter and the florin's genesis. The devnet's
///         differences from the public networks, each stated where it is made:
///         mock tokens, a mock Permit2 and swap venue, a mock SP1 verifier and
///         the dev key, 0.001 ETH stakes and no member cooldown, the schedule
///         anchored at the deploy block, founder + supporters lumped on the
///         deployer, a mock treasury multisig, and test-token mints.
///         deploy-local.sh parses the "deployed at:" lines this script prints.
contract Deploy is DeployBase {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        // Hoisted once: run() compiles at the legacy-codegen stack limit, and
        // evaluating vm.addr() inside deep call sites is what tips it over.
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // ── Mock tokens ─────────────────────────────────────────────
        // Assigned to contract-state vars (not run()-local), as every address
        // below is: under coverage instrumentation (FOUNDRY_PROFILE=coverage,
        // --ir-minimum), every deployed address here stays live from its
        // declaration through the NEXT_PUBLIC_ summary at the end of run(),
        // which overflows the Yul stack allocator at minimum optimization.
        // Storage reads/writes are addressed by slot, not stack residency, so
        // keeping the long-lived results off the stack relieves the pressure
        // with no change to deployment order, addresses, or logged output —
        // this is script-local EVM state (discarded after the script runs),
        // never broadcast.
        _token = new MockERC20("Mock Token", "MOCK");
        console.log("MockERC20 deployed at:", address(_token));

        _permitToken = new MockPermitToken();
        console.log("MockPermitToken deployed at:", address(_permitToken));

        // ── Core + AttestationCoordinator ───────────────────────────
        _deployCore();
        console.log("FigaroCore deployed at:", _core);
        console.log("AttestationCoordinator deployed at:", _attestation);

        // ── WitnessSwapAndCommitCoordinator ─────────────────────────
        // Off-protocol multi-token bond funding. Devnet composes it with a
        // mock Permit2 (witness-signature-verifying — digest parity with the
        // canonical deployment is proven by the mainnet-fork suite) and a
        // mock swap venue; mainnet uses the canonical Permit2 and the real
        // Uniswap SwapRouter02. The router is pre-funded with bond-token
        // liquidity so buyer legs can swap the permit token into the bond
        // currency at the mock's settable rate (1:1 default).
        _permit2 = new MockWitnessPermit2();
        console.log("MockWitnessPermit2 deployed at:", address(_permit2));

        _router = new MockSwapVenue();
        console.log("MockSwapVenue deployed at:", address(_router));

        // Devnet: the venue is a mock, so the SwapRouter02 probe the public
        // networks run does not apply.
        _deploySwapCoordinator(_core, address(_permit2), address(_router));
        console.log("WitnessSwapAndCommitCoordinator deployed at:", _swapCoordinator);

        // Router liquidity in both devnet tokens, so either can be swap output.
        _token.mint(address(_router), 10_000_000 ether);
        _permitToken.mint(address(_router), 10_000_000 ether);

        // ── The four registries ─────────────────────────────────────
        // Deposit = staked intent (K4): registering is reclaimable via
        // withdrawDeposit — which de-surfaces the entry. No time lock;
        // pollution is priced by deposit × time-surfaced. Each family has its
        // own anchor per the separation-of-concerns doctrine.
        //
        // Clauses are NOT registered here. They are pinned to IPFS + anchored
        // on ClauseRegistry by frontend/scripts/populate-clauses.mjs — the single
        // clause-population path for prod/testnet/mainnet, so each on-chain
        // (clauseKey, contentURI) points at a REAL pinned spec whose bytes
        // hash to the key (not a placeholder). Run it after deploy.
        //
        // There is NO on-chain clause-content validation: the chain binds an
        // attestation to its signed agreement (merkle inclusion) and to its
        // content (keccak256). Content well-formedness is the off-chain SDK's
        // job (honest authors) and a read-time concern (downstream forums
        // reject garbage). Any registered clause is attestable with no
        // per-clause on-chain code — open-world by construction.
        //
        // Devnet: 0.001 ETH stakes so test wallets can register without faucet
        // drama (the public networks: 0.05 ETH, sized in DeployPublicStack).
        // COOLDOWN 0 ON DEVNET, deliberately: a requested withdrawal is
        // claimable in the same block, so e2e runs that register → leave →
        // re-register do not have to warp a chain they share with the
        // frontend. The cooldown's BEHAVIOR is covered in Foundry against a
        // non-zero parameter (MembersRegistryTest), not here.
        _deployRegistries(0.001 ether, 0.001 ether, 0);
        console.log("ClauseRegistry deployed at:", _clauses);
        console.log("ProcessRegistry deployed at:", _assemblies);
        console.log("AgreementRegistry deployed at:", _agreements);
        console.log("MembersRegistry deployed at:", _members);

        // ── Multisender (composition target; mock on devnet) ────────
        // Batch dispersal — one payment, many recipients, one transaction;
        // post-resolution fiscal routing (a wallet splits its own receipts
        // to earmarked addresses) — is COMPOSED, not owned: mainnet uses
        // the canonical public Disperse deployment
        // (0xD152f549545093347A162Dce210e7293f1452150, same address across
        // 16 chains). MockDisperse mirrors its
        // verified interface so devnet rehearses the composition.
        // Scoped block: the address is only logged, and run() compiles at the
        // stack limit under the legacy codegen (via_ir=false by design).
        {
            MockDisperse multisender = new MockDisperse();
            console.log("MockDisperse deployed at:", address(multisender));
        }

        // ── Batch-resolution proof path (mock verifier on devnet) ──
        // MockSP1Verifier accepts any proof; the real deployment wires
        // the SP1 verifier Succinct's gateway routes + the program vkey from
        // `SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release`
        // (DeployPublicStack).
        _deployUsageAndVerifier(deployer);

        // ── florin token + RPGF minter ─────────────────────────────────
        // The RPGF minter must exist AT GENESIS: FlorinToken.registerMinter only
        // works before renounceDeployerMint, and renounce is irreversible — so
        // the 600M distribution registers here, before any other genesis step.
        _deployFlorinAndMinter();
        console.log("FlorinToken deployed at:", _florin);
        console.log("RpgfMinter deployed at:", _rpgfMinter);

        _deployTreasuryGenesis(deployer);

        // ── Mint test tokens to Anvil accounts ──────────────────────
        // anvil[0..19] — all 20 accounts minted EXPLICITLY. The deployer is
        // a randomized throwaway key (deploy-local.sh), so no anvil account
        // inherits the constructor mint; anvil[0] is funded here like every
        // other index. anvil must launch with `--accounts 38` (the count
        // lint-anvil-accounts-lockstep.sh enforces across devup/CI) so these
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
            _token.mint(testAccounts[i], 100_000 ether);
            _permitToken.mint(testAccounts[i], 100_000 ether);
        }
        console.log("Minted test tokens to Anvil accounts [0]-[19]");

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete. Addresses:");
        console.log("  NEXT_PUBLIC_FIGARO_CORE=", _core);
        console.log("  NEXT_PUBLIC_TOKEN_ADDRESS=", address(_token));
        console.log("  NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=", address(_permitToken));
        console.log("  NEXT_PUBLIC_ATTESTATION_COORDINATOR=", _attestation);
        console.log("  NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR=", _swapCoordinator);
        console.log("  NEXT_PUBLIC_PERMIT2=", address(_permit2));
        console.log("  NEXT_PUBLIC_SWAP_ROUTER=", address(_router));
        console.log("  NEXT_PUBLIC_CLAUSE_REGISTRY=", _clauses);
        console.log("  NEXT_PUBLIC_MEMBERS_REGISTRY=", _members);
        console.log("  NEXT_PUBLIC_PROCESS_REGISTRY=", _assemblies);
        console.log("  NEXT_PUBLIC_AGREEMENT_REGISTRY=", _agreements);
        console.log("  NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS=", _florin);
        console.log("  NEXT_PUBLIC_BATCH_VERIFIER=", _batchVerifier);
    }

    // The devnet's own contracts; the shared addresses are DeployBase's.
    MockERC20 internal _token;
    MockPermitToken internal _permitToken;
    MockWitnessPermit2 internal _permit2;
    MockSwapVenue internal _router;

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    ///      The counter↔verifier pair is `DeployBase._deployPair`, the one
    ///      every chain runs. Devnet differences: a mock SP1 verifier, the dev
    ///      key when no relay is built, and the schedule anchored at the deploy
    ///      block's time (no RPGF_GENESIS).
    ///
    ///      ONE SCHEDULE EVERYWHERE — the devnet's periods are the year of
    ///      every public network. The claim path gates on `periodClosed`, and
    ///      the rewards spec closes a period the way a chain does: it advances
    ///      the chain's clock just past the open period's end
    ///      (evm_increaseTime), never by waiting. The jump's length is
    ///      harmless — every deadline a spec signs is derived from chain time
    ///      at signing, the specs run one at a time and sign after any earlier
    ///      jump, and the genesis population seeds nothing time-bound. A short
    ///      devnet schedule tested nothing and cost the devnet its life:
    ///      RESOLVE-TIME USAGE RECORDING (the resolve capability records every
    ///      committed clause or assembly) needs the accrual OPEN, and with the
    ///      last period ended every recording reverted AccrualClosed on a
    ///      chain that was otherwise whole. With annual periods a devnet closes
    ///      for accrual only after nine runs of the rewards spec; the devnet
    ///      preflight reads `currentPeriod()` and devup redeploys a closed chain.
    function _deployUsageAndVerifier(address deployer) internal {
        MockSP1Verifier mockSp1 = new MockSP1Verifier();
        console.log("MockSP1Verifier deployed at:", address(mockSp1));

        // The guest fingerprint the verifier pins: the sequencer this tree
        // built reports its own (`sequencer --vkey`, exported by the deploy
        // wrapper when the binary is present), so a relay can start against
        // this verifier — a relay refuses a verifier that pins a key its
        // guest does not carry; with no binary built, a dev constant.
        _deployPair(
            deployer,
            address(mockSp1),
            vm.envOr("SP1_PROGRAM_VKEY", keccak256(abi.encodePacked("figaro-kernel-dev"))),
            uint64(block.timestamp)
        );
        console.log("UsageCounter deployed at:", _usageCounter);
        console.log("  NEXT_PUBLIC_USAGE_COUNTER=", _usageCounter);
        console.log("FigaroBatchVerifier deployed at:", _batchVerifier);
    }

    /// @dev Own frame: keeps run()'s stack shallow (via_ir=false by design).
    ///      Devnet genesis mint, rehearsing the mainnet 7/3/30/60 custody shape:
    ///      100M founder + supporters stand-in to the deployer (mainnet splits
    ///      this into 70M FOUNDER_WALLET + 30M SUPPORTERS_WALLET), 300M DAO to a
    ///      treasury MULTISIG (mainnet: a canonical Safe at DAO_WALLET —
    ///      config, never code; devnet: MockTreasuryMultisig with anvil[0..2]
    ///      as 2-of-3 placeholder owners, per the anvil-placeholder ruling).
    ///      The DAO buys through a per-procurement funded operator-EOA — the
    ///      treasury itself never signs commitments (FigaroCore is
    ///      ECDSA-only).
    function _deployTreasuryGenesis(address deployer) internal {
        address[] memory treasuryOwners = new address[](3);
        treasuryOwners[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // anvil[0]
        treasuryOwners[1] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // anvil[1]
        treasuryOwners[2] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // anvil[2]
        MockTreasuryMultisig daoTreasury = new MockTreasuryMultisig(treasuryOwners, 2);
        console.log("MockTreasuryMultisig deployed at:", address(daoTreasury));

        // Devnet: founder + supporters lumped on the deployer.
        address[] memory to = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        (to[0], amounts[0]) = (deployer, FOUNDER_ALLOC + SUPPORTERS_ALLOC);
        (to[1], amounts[1]) = (address(daoTreasury), DAO_ALLOC);
        _mintGenesisAndRenounce(deployer, to, amounts);
        console.log("Deployer mint renounced");
        console.log("  NEXT_PUBLIC_DAO_TREASURY=", address(daoTreasury));
    }
}
