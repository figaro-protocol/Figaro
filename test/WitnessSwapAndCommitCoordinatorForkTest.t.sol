// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/kernel/FigaroCore.sol";
import "../src/kernel/CommitmentTypes.sol";
import "../src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockUniversalRouter.sol";

/// @notice The one Permit2 surface this suite needs beyond the coordinator's
///         own interface: the live domain separator.
interface IPermit2DomainSeparator {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @title WitnessSwapAndCommitCoordinatorForkTest — the witness digest against REAL Permit2
/// @notice Mainnet-fork round-trip. Every other layer verifies the witness
///         convention against `MockWitnessPermit2` — our own reconstruction of
///         Permit2's digest rules. This suite is the parity proof: the same
///         `swapWitness` + `WITNESS_TYPE_STRING` convention, signed by the
///         party, must be ACCEPTED by the canonical Permit2 deployment
///         (0x…78BA3) pulling real token balances, and a substituted route must
///         be REJECTED by real Permit2's own signature check — not by our mock.
/// @dev Gated on `MAINNET_RPC_URL`; without it every test is SKIPPED (never
///      silently passed). Run: MAINNET_RPC_URL=<url> forge test --match-contract
///      WitnessSwapAndCommitCoordinatorForkTest. The router stays a mock — the
///      swap venue is an off-protocol auxiliary; the surface under proof is the
///      Permit2 witness digest, nothing else.
contract WitnessSwapAndCommitCoordinatorForkTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    /// @dev Canonical Permit2, same address on every chain it is deployed to.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    FigaroCore internal core;
    MockUniversalRouter internal router;
    WitnessSwapAndCommitCoordinator internal coord;

    MockERC20 internal bond;
    MockERC20 internal buyerInput;

    // Fork-suite-local keys; unordered Permit2 nonces below dodge any prior
    // on-chain use of these derivable addresses.
    uint256 internal constant BUYER_KEY = 0xF1A20B0B;
    uint256 internal constant SELLER_KEY = 0xF1A25E11;
    uint256 internal constant NONCE = uint256(keccak256("figaro-witness-fork-nonce"));
    address internal buyer;
    address internal seller;
    address internal relayer = address(0xBEEF);

    uint256 internal constant P = 1000 ether;

    bool internal forked;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // tests skip themselves below
        vm.createSelectFork(rpc);
        forked = true;

        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        router = new MockUniversalRouter();
        coord = new WitnessSwapAndCommitCoordinator(address(core), PERMIT2, address(router));

        bond = new MockERC20("Bond", "USDC");
        buyerInput = new MockERC20("BuyerIn", "DAI");
        bond.mint(address(router), 1_000_000 ether);

        // Standing approvals: bond currency to the kernel; input token to REAL Permit2.
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

    modifier onlyForked() {
        vm.skip(!forked);
        _;
    }

    // ── Helpers (mirror WitnessSwapAndCommitCoordinatorTest, real domain) ──

    function _rootCommitment() internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(bond),
            payment: P,
            expectedCumulativeValue: P,
            agreementHash: keccak256("witness-fork-root"),
            salt: 1,
            deadline: block.timestamp + 1 hours
        });
    }

    function _sign(CommitmentTypes.Commitment memory c, uint256 key) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FigaroCore"),
                keccak256("3"),
                block.chainid,
                address(core)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, c.hashStruct()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _swapData(uint256 amountIn) internal view returns (bytes memory) {
        return abi.encodeCall(MockUniversalRouter.swap, (address(buyerInput), address(bond), amountIn, address(coord)));
    }

    /// @dev The witness digest, built with REAL Permit2's live DOMAIN_SEPARATOR —
    ///      the reconstruction under proof.
    function _permitDigest(uint256 maxInput, uint256 deadline, bytes memory swapData)
        internal
        view
        returns (bytes32)
    {
        bytes32 witness = coord.swapWitness(address(buyerInput), maxInput, swapData);
        bytes32 typeHash = keccak256(
            abi.encodePacked(
                "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,",
                "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)TokenPermissions(address token,uint256 amount)"
            )
        );
        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), address(buyerInput), maxInput)
        );
        bytes32 structHash = keccak256(abi.encode(typeHash, tokenPermissionsHash, address(coord), NONCE, deadline, witness));
        return keccak256(abi.encodePacked("\x19\x01", IPermit2DomainSeparator(PERMIT2).DOMAIN_SEPARATOR(), structHash));
    }

    function _buyerLeg(bytes memory swapData, bytes memory signedRouteData)
        internal
        view
        returns (WitnessSwapAndCommitCoordinator.SwapFunding memory)
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(2 * P, deadline, signedRouteData);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_KEY, digest);
        return WitnessSwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: address(buyerInput),
            maxInput: 2 * P,
            permitNonce: NONCE,
            permitDeadline: deadline,
            permitSignature: abi.encodePacked(r, s, v),
            swapData: swapData
        });
    }

    function _disabled() internal pure returns (WitnessSwapAndCommitCoordinator.SwapFunding memory f) {}

    // ── The parity proofs ──────────────────────────────────────────

    /// @notice Round-trip: a witness signature built by our convention is
    ///         accepted by canonical Permit2, the input token moves, the swap
    ///         funds the buyer, the kernel pulls both bonds, the commit lands.
    function test_Fork_RoundTrip_RealPermit2AcceptsWitness() public onlyForked {
        CommitmentTypes.Commitment memory c = _rootCommitment();
        bytes memory route = _swapData(2 * P);

        vm.prank(relayer);
        coord.swapAndCommit(c, _sign(c, BUYER_KEY), _sign(c, SELLER_KEY), _buyerLeg(route, route), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "real Permit2 pulled the buyer's input");
        assertEq(bond.balanceOf(address(coord)), 0, "coordinator retains no bond currency");
        assertEq(buyerInput.balanceOf(address(coord)), 0, "coordinator retains no input token");
    }

    /// @notice The front-run proof against the REAL verifier: a route the party
    ///         did not sign is rejected by canonical Permit2's own signature
    ///         check before any token moves.
    function test_Fork_RealPermit2RejectsSubstitutedRoute() public onlyForked {
        CommitmentTypes.Commitment memory c = _rootCommitment();
        bytes memory signedRoute = _swapData(2 * P);
        bytes memory substitutedRoute = _swapData(P); // relayer's cheaper route

        // Build everything BEFORE arming expectRevert — leg construction makes a
        // `swapWitness` staticcall that would otherwise consume the expectation.
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _buyerLeg(substitutedRoute, signedRoute);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        uint256 inputBefore = buyerInput.balanceOf(buyer);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSignature("InvalidSigner()"));
        coord.swapAndCommit(c, bSig, sSig, leg, _disabled());
        assertEq(buyerInput.balanceOf(buyer), inputBefore, "no token moved on a substituted route");
    }
}
