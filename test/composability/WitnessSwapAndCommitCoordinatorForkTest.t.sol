// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/composability/WitnessSwapAndCommitCoordinator.sol";
import "src/mocks/MockERC20.sol";
import "src/mocks/MockSwapVenue.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";

/// @notice The one Permit2 surface this suite needs beyond the coordinator's
///         own interface: the live domain separator.
interface IPermit2DomainSeparator {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice The fixtures both fork suites share. Forks a few blocks behind the
///         head: an RPC endpoint is often several nodes behind one URL, and
///         the node that answers the fork's block read may not yet hold the
///         block another node named as the newest: `setUp` then failed with
///         "block not found". The head is read once with `eth_blockNumber`,
///         and the fork is made at that number less `FORK_MARGIN`, a block
///         every node behind the URL already holds.
///
///         A fork suite never skips: with its RPC variable unset, `setUp`
///         reverts naming the variable, and every test of the suite fails. A
///         run that cannot supply the variable does not select this file.
abstract contract WitnessForkBase is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    /// @dev About a minute and a half of blocks on Ethereum and on Sepolia.
    uint256 internal constant FORK_MARGIN = 8;

    /// @dev Canonical Permit2, same address on every chain it is deployed to.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    address internal relayer = address(0xBEEF);

    FigaroCore internal core;
    WitnessSwapAndCommitCoordinator internal coord;

    /// @dev Forks the chain the RPC URL in `envVar` serves, or reverts naming
    ///      the variable.
    function _forkFrom(string memory envVar) internal {
        string memory rpc = vm.envOr(envVar, string(""));
        require(
            bytes(rpc).length != 0,
            string.concat(envVar, " is not set: this fork suite needs an RPC URL and never skips")
        );
        // The answer is the quantity's bytes, big-endian.
        bytes memory head = vm.rpc(rpc, "eth_blockNumber", "[]");
        uint256 number;
        for (uint256 i = 0; i < head.length; i++) {
            number = (number << 8) | uint8(head[i]);
        }
        vm.createSelectFork(rpc, number - FORK_MARGIN);
    }

    /// @dev A commitment signed under the domain the deployed Core reports.
    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        return SigningTestHelper.signCommitment(address(core), c, key);
    }

    /// @dev The witness digest, built with REAL Permit2's live DOMAIN_SEPARATOR —
    ///      the reconstruction under proof. The leg is the buyer's (role 0) of
    ///      the commitment whose struct hash is `commitmentHash`.
    function _permitDigest(
        address inputToken,
        uint256 maxInput,
        uint256 nonce,
        uint256 deadline,
        bytes memory swapData,
        bytes32 commitmentHash
    ) internal view returns (bytes32) {
        bytes32 witness = coord.swapWitness(inputToken, maxInput, swapData, commitmentHash, 0);
        bytes32 typeHash = keccak256(
            abi.encodePacked(
                "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,",
                "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash,bytes32 commitmentHash,uint8 role)TokenPermissions(address token,uint256 amount)"
            )
        );
        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), inputToken, maxInput));
        bytes32 structHash =
            keccak256(abi.encode(typeHash, tokenPermissionsHash, address(coord), nonce, deadline, witness));
        return SigningTestHelper.typedDataHash(IPermit2DomainSeparator(PERMIT2).DOMAIN_SEPARATOR(), structHash);
    }

    /// @dev The buyer's funding leg: `swapData` is what the leg carries,
    ///      `signedSwapData` what the buyer's witness signature covers.
    function _buyerLeg(
        uint256 buyerKey,
        address inputToken,
        uint256 maxInput,
        uint256 nonce,
        bytes memory swapData,
        bytes memory signedSwapData,
        bytes32 commitmentHash
    ) internal view returns (WitnessSwapAndCommitCoordinator.SwapFunding memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(inputToken, maxInput, nonce, deadline, signedSwapData, commitmentHash);
        return WitnessSwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: inputToken,
            maxInput: maxInput,
            permitNonce: nonce,
            permitDeadline: deadline,
            permitSignature: SigningTestHelper.sign(buyerKey, digest),
            swapData: swapData
        });
    }

    function _disabled() internal pure returns (WitnessSwapAndCommitCoordinator.SwapFunding memory f) {}
}

/// @title WitnessSwapAndCommitCoordinatorForkTest — the witness digest against REAL Permit2
/// @notice Mainnet-fork round-trip. Every other layer verifies the witness
///         convention against `MockWitnessPermit2` — our own reconstruction of
///         Permit2's digest rules. This suite is the parity proof: the same
///         `swapWitness` + `WITNESS_TYPE_STRING` convention, signed by the
///         party, must be ACCEPTED by the canonical Permit2 deployment
///         (0x…78BA3) pulling real token balances, and a substituted route must
///         be REJECTED by real Permit2's own signature check — not by our mock.
/// @dev Needs `MAINNET_RPC_URL`; without it every test FAILS, naming the
///      variable (never skipped, never silently passed). Run:
///      MAINNET_RPC_URL=<url> forge test --match-contract
///      WitnessSwapAndCommitCoordinatorForkTest. The router stays a mock — the
///      swap venue is an off-protocol auxiliary; the surface under proof is the
///      Permit2 witness digest, nothing else.
contract WitnessSwapAndCommitCoordinatorForkTest is WitnessForkBase {
    using CommitmentTypes for CommitmentTypes.Commitment;

    MockSwapVenue internal router;

    MockERC20 internal bond;
    MockERC20 internal buyerInput;

    // Fork-suite-local keys; unordered Permit2 nonces below dodge any prior
    // on-chain use of these derivable addresses.
    uint256 internal constant BUYER_KEY = 0xF1A20B0B;
    uint256 internal constant SELLER_KEY = 0xF1A25E11;
    uint256 internal constant NONCE = uint256(keccak256("figaro-witness-fork-nonce"));
    address internal buyer;
    address internal seller;

    uint256 internal constant P = 1000 ether;

    function setUp() public {
        _forkFrom("MAINNET_RPC_URL");

        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        router = new MockSwapVenue();
        coord = new WitnessSwapAndCommitCoordinator(address(core), PERMIT2, address(router));

        bond = new MockERC20("Bond", "USDC");
        buyerInput = new MockERC20("BuyerIn", "DAI");
        bond.mint(address(router), 1_000_000 ether);

        // Standing approvals: bond currency to FigaroCore; input token to REAL Permit2.
        vm.prank(buyer);
        bond.approve(address(core), type(uint256).max);
        vm.prank(seller);
        bond.approve(address(core), type(uint256).max);
        buyerInput.mint(buyer, 2 * P);
        vm.prank(buyer);
        buyerInput.approve(PERMIT2, type(uint256).max);
        bond.mint(seller, 2 * P); // seller self-funds its bond leg

        vm.label(PERMIT2, "Permit2(canonical)");
    }

    function _rootCommitment() internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(bond),
            payment: P,
            runningTotal: P,
            checkoutHash: keccak256("witness-fork-root"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });
    }

    function _swapData(uint256 amountIn) internal view returns (bytes memory) {
        return abi.encodeCall(MockSwapVenue.swap, (address(buyerInput), address(bond), amountIn, address(coord)));
    }

    function _leg(bytes memory swapData, bytes memory signedRouteData)
        internal
        view
        returns (WitnessSwapAndCommitCoordinator.SwapFunding memory)
    {
        return _buyerLeg(
            BUYER_KEY, address(buyerInput), 2 * P, NONCE, swapData, signedRouteData, _rootCommitment().hashStruct()
        );
    }

    // ── The parity proofs ──────────────────────────────────────────

    /// @notice Round-trip: a witness signature built by our convention is
    ///         accepted by canonical Permit2, the input token moves, the swap
    ///         funds the buyer, FigaroCore pulls both bonds, the commit lands.
    function test_Fork_RoundTrip_RealPermit2AcceptsWitness() public {
        CommitmentTypes.Commitment memory c = _rootCommitment();
        bytes memory route = _swapData(2 * P);

        vm.prank(relayer);
        coord.swapAndCommit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY), _leg(route, route), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "real Permit2 pulled the buyer's input");
        assertEq(bond.balanceOf(address(coord)), 0, "coordinator retains no bond currency");
        assertEq(buyerInput.balanceOf(address(coord)), 0, "coordinator retains no input token");
    }

    /// @notice The front-run proof against the REAL verifier: a route the party
    ///         did not sign is rejected by canonical Permit2's own signature
    ///         check before any token moves.
    function test_Fork_RealPermit2RejectsSubstitutedRoute() public {
        CommitmentTypes.Commitment memory c = _rootCommitment();
        bytes memory signedRoute = _swapData(2 * P);
        bytes memory substitutedRoute = _swapData(P); // relayer's cheaper route

        // Build everything BEFORE arming expectRevert — leg construction makes a
        // `swapWitness` staticcall that would otherwise consume the expectation.
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(substitutedRoute, signedRoute);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        uint256 inputBefore = buyerInput.balanceOf(buyer);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSignature("InvalidSigner()"));
        coord.swapAndCommit(c, bSig, sSig, leg, _disabled());
        assertEq(buyerInput.balanceOf(buyer), inputBefore, "no token moved on a substituted route");
    }
}

/// @notice The one SwapRouter02 surface this suite composes: the exact-output
///         swap the venue seam encodes (`SWAP_ROUTER_02_ABI` in the SDK), which
///         pulls its input from msg.sender by ERC-20 allowance.
interface ISwapRouter02 {
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn);
}

/// @title WitnessSwapAndCommitCoordinatorSepoliaVenueForkTest — the REAL venue
/// @notice Sepolia-fork complement of the suite above: there the venue stays a
///         mock and REAL Permit2 is under proof; here the coordinator drives the
///         DEPLOYED Sepolia SwapRouter02 (deployments/11155111.json `swapRouter`)
///         with `exactOutputSingle` calldata built the documented way — exact
///         output = the bond, recipient = the coordinator, input pulled from the
///         coordinator by the ERC-20 allowance `_fund` forceApproves. Proves the
///         allowance-pull composition end to end against the real venue and the
///         real WETH/USDC 0.05% pool (liquidity verified before this test was
///         written).
/// @dev Needs `SEPOLIA_RPC_URL`; without it every test FAILS, naming the
///      variable (never skipped, never silently passed). Run:
///      SEPOLIA_RPC_URL=<url> forge test --match-contract
///      WitnessSwapAndCommitCoordinatorSepoliaVenueForkTest.
contract WitnessSwapAndCommitCoordinatorSepoliaVenueForkTest is WitnessForkBase {
    using CommitmentTypes for CommitmentTypes.Commitment;

    /// @dev The deployed Sepolia SwapRouter02 the protocol composes
    ///      (deployments/11155111.json, key `swapRouter`).
    address internal constant SWAP_ROUTER_02 = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    /// @dev Sepolia WETH9 (the router's own WETH9()) — the buyer's input token.
    IERC20 internal constant WETH = IERC20(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14);
    /// @dev Sepolia USDC — the process bond currency (real pool: WETH/USDC 500).
    IERC20 internal constant USDC = IERC20(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);
    uint24 internal constant POOL_FEE = 500;

    uint256 internal constant BUYER_KEY = 0xF1A20B0C;
    uint256 internal constant SELLER_KEY = 0xF1A25E12;
    uint256 internal constant NONCE = uint256(keccak256("figaro-sepolia-venue-fork-nonce"));
    address internal buyer;
    address internal seller;

    /// @dev Payment: 1 USDC (6 decimals) — small against the pool's liquidity.
    uint256 internal constant P = 1e6;
    /// @dev The witness-signed input ceiling: 0.01 WETH, generous headroom over
    ///      the live quote (~9.2e13 wei for 2 USDC out when this was written).
    uint256 internal constant MAX_INPUT = 1e16;

    function setUp() public {
        _forkFrom("SEPOLIA_RPC_URL");

        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        coord = new WitnessSwapAndCommitCoordinator(address(core), PERMIT2, SWAP_ROUTER_02);

        // Both parties start holding only WETH (deal writes the balance entry).
        deal(address(WETH), buyer, 1 ether);
        deal(address(WETH), seller, 1 ether);

        // Buyer: bond currency to FigaroCore, input token to REAL Permit2.
        vm.startPrank(buyer);
        USDC.approve(address(core), type(uint256).max);
        WETH.approve(PERMIT2, type(uint256).max);
        vm.stopPrank();

        // Seller self-funds its bond: acquire real USDC through the real venue
        // directly (the same allowance-pull the coordinator relies on), then
        // approve FigaroCore.
        vm.startPrank(seller);
        WETH.approve(SWAP_ROUTER_02, type(uint256).max);
        ISwapRouter02(SWAP_ROUTER_02)
            .exactOutputSingle(
                ISwapRouter02.ExactOutputSingleParams({
                    tokenIn: address(WETH),
                    tokenOut: address(USDC),
                    fee: POOL_FEE,
                    recipient: seller,
                    amountOut: 2 * P,
                    amountInMaximum: MAX_INPUT,
                    sqrtPriceLimitX96: 0
                })
            );
        USDC.approve(address(core), type(uint256).max);
        vm.stopPrank();

        vm.label(PERMIT2, "Permit2(canonical)");
        vm.label(SWAP_ROUTER_02, "SwapRouter02(Sepolia)");
    }

    function _rootCommitment() internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            token: address(USDC),
            payment: P,
            runningTotal: P,
            checkoutHash: keccak256("sepolia-venue-fork-root"),
            salt: 1,
            commitDeadline: block.timestamp + 1 hours
        });
    }

    /// @dev The buyer leg's `swapData`, built the DOCUMENTED way (sdk/README.md
    ///      § "Bonding in a token you do not hold" / the SDK's
    ///      SWAP_ROUTER_02_ABI): exact output = the buyer bond (2·payment),
    ///      recipient = the coordinator, amountInMaximum = the witness cap.
    function _swapData() internal view returns (bytes memory) {
        return abi.encodeCall(
            ISwapRouter02.exactOutputSingle,
            (ISwapRouter02.ExactOutputSingleParams({
                    tokenIn: address(WETH),
                    tokenOut: address(USDC),
                    fee: POOL_FEE,
                    recipient: address(coord),
                    amountOut: 2 * P,
                    amountInMaximum: MAX_INPUT,
                    sqrtPriceLimitX96: 0
                }))
        );
    }

    /// @notice Round-trip against the REAL venue: Permit2 pulls the buyer's
    ///         WETH, the deployed SwapRouter02 pulls it onward by the
    ///         coordinator's allowance and delivers exactly the bond in USDC,
    ///         FigaroCore pulls both bonds, the commit lands, and every
    ///         residual comes back to the buyer.
    function test_Fork_RealSepoliaSwapRouter02FundsTheBond() public {
        CommitmentTypes.Commitment memory c = _rootCommitment();
        bytes memory route = _swapData();
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg =
            _buyerLeg(BUYER_KEY, address(WETH), MAX_INPUT, NONCE, route, route, c.hashStruct());

        vm.prank(relayer);
        coord.swapAndCommit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY), leg, _disabled());

        assertEq(USDC.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(USDC.balanceOf(buyer), 0, "swap delivered exactly the bond; FigaroCore pulled it all");
        assertEq(USDC.balanceOf(address(coord)), 0, "coordinator retains no bond currency");
        assertEq(WETH.balanceOf(address(coord)), 0, "coordinator retains no input token");
        assertGt(WETH.balanceOf(buyer), 1 ether - MAX_INPUT, "the unswapped input residual was refunded to the buyer");
    }
}
