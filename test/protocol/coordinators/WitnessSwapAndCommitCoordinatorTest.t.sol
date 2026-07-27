// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "src/kernel/FigaroCore.sol";
import "src/kernel/CommitmentTypes.sol";
import "src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol";
import "src/mocks/MockERC20.sol";
import "src/mocks/MockUniversalRouter.sol";
import "src/mocks/MockWitnessPermit2.sol";

/// @title WitnessSwapAndCommitCoordinatorTest — the swap route is now signed
/// @notice Mirrors SwapAndCommitCoordinatorTest's coverage, but every leg
///         carries a real Permit2 WITNESS signature, and adds the front-run
///         proof: a substituted `swapData` fails signature verification.
contract WitnessSwapAndCommitCoordinatorTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockWitnessPermit2 internal permit2;
    MockUniversalRouter internal router;
    WitnessSwapAndCommitCoordinator internal coord;

    MockERC20 internal bond; // process bond currency (e.g. USDC)
    MockERC20 internal buyerInput; // token the buyer holds (e.g. DAI)
    MockERC20 internal sellerInput; // token the seller holds (e.g. WETH)

    uint256 internal constant BUYER_KEY = 0xB0B;
    uint256 internal constant SELLER_KEY = 0x5E11;
    address internal buyer;
    address internal seller;
    address internal relayer = address(0xBEEF); // any caller — the coordinator is a pure executor

    uint256 internal constant P = 1000 ether; // payment; buyer bond 2P, seller bond 2P at root
    uint256 internal constant MINT = 1_000_000 ether;

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();
        permit2 = new MockWitnessPermit2();
        router = new MockUniversalRouter();
        coord = new WitnessSwapAndCommitCoordinator(address(core), address(permit2), address(router));

        bond = new MockERC20("Bond", "USDC");
        buyerInput = new MockERC20("BuyerIn", "DAI");
        sellerInput = new MockERC20("SellerIn", "WETH");

        // Router liquidity in the bond currency.
        bond.mint(address(router), MINT);

        // Standing FigaroCore approval for the bond currency (same as the base flow).
        vm.prank(buyer);
        bond.approve(address(core), type(uint256).max);
        vm.prank(seller);
        bond.approve(address(core), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────

    function _rootCommitment(uint256 salt) internal view returns (CommitmentTypes.Commitment memory) {
        return CommitmentTypes.Commitment({
            processId: bytes32(0),
            buyer: buyer,
            seller: seller,
            currency: address(bond),
            payment: P,
            expectedCumulativeValue: P,
            agreementHash: keccak256("witness-swap-commit-root"),
            salt: salt,
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

    /// @dev Build the swap calldata for a leg routing `amountIn` of `input` to
    ///      `recipient` (normally the coordinator).
    function _swapData(MockERC20 input, uint256 amountIn, address recipient) internal view returns (bytes memory) {
        return abi.encodeCall(MockUniversalRouter.swap, (address(input), address(bond), amountIn, recipient));
    }

    /// @dev The Permit2 witness digest a party signs, reconstructed with the
    ///      SAME rules as MockWitnessPermit2 (spender = the coordinator).
    function _permitDigest(address inputToken, uint256 maxInput, uint256 nonce, uint256 deadline, bytes memory swapData)
        internal
        view
        returns (bytes32)
    {
        bytes32 witness = coord.swapWitness(inputToken, maxInput, swapData);
        bytes32 typeHash = keccak256(
            abi.encodePacked(
                "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,",
                "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)TokenPermissions(address token,uint256 amount)"
            )
        );
        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), inputToken, maxInput));
        bytes32 structHash =
            keccak256(abi.encode(typeHash, tokenPermissionsHash, address(coord), nonce, deadline, witness));
        return keccak256(abi.encodePacked("\x19\x01", permit2.DOMAIN_SEPARATOR(), structHash));
    }

    /// @dev A witness-signed swap-funding leg: swaps `amountIn` of `input` to the
    ///      bond currency, routed to the coordinator, with a Permit2 witness
    ///      signature by `partyKey` over that exact route.
    function _leg(MockERC20 input, uint256 amountIn, uint256 partyKey)
        internal
        view
        returns (WitnessSwapAndCommitCoordinator.SwapFunding memory)
    {
        bytes memory swapData = _swapData(input, amountIn, address(coord));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(address(input), amountIn, 0, deadline, swapData);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(partyKey, digest);
        return WitnessSwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: address(input),
            maxInput: amountIn,
            permitNonce: 0,
            permitDeadline: deadline,
            permitSignature: abi.encodePacked(r, s, v),
            swapData: swapData
        });
    }

    function _disabled() internal pure returns (WitnessSwapAndCommitCoordinator.SwapFunding memory f) {
        // all zero, enabled = false
    }

    /// @dev Give a party `amountIn` of `input` + the one-time Permit2 approval.
    function _fundInput(address party, MockERC20 input, uint256 amountIn) internal {
        input.mint(party, amountIn);
        vm.prank(party);
        input.approve(address(permit2), type(uint256).max);
    }

    /// @dev Give a self-funding party `bondAmount` of bond currency directly.
    function _selfFundBond(address party, uint256 bondAmount) internal {
        bond.mint(party, bondAmount);
    }

    // ── Mirrored coverage (now witness-signed) ─────────────────────

    function test_BuyerPaysDifferentToken() public {
        _fundInput(buyer, buyerInput, 2 * P); // rate 1:1, needs 2P input for 2P bond
        _selfFundBond(seller, 2 * P); // seller self-funds its 2P bond in USDC

        CommitmentTypes.Commitment memory c = _rootCommitment(1);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P, BUYER_KEY), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "buyer input fully swapped");
        assertEq(bond.balanceOf(buyer), 0, "buyer funded then pulled, no residual at 1:1");
        assertEq(bond.balanceOf(seller), 0, "seller bond pulled from self-funded balance");
    }

    function test_SellerPaysDifferentToken() public {
        _selfFundBond(buyer, 2 * P); // buyer self-funds its 2P bond in USDC
        _fundInput(seller, sellerInput, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(2);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _leg(sellerInput, 2 * P, SELLER_KEY));

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(sellerInput.balanceOf(seller), 0, "seller input fully swapped");
        assertEq(bond.balanceOf(seller), 0, "seller funded then pulled");
    }

    function test_BothSidesSwap() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _fundInput(seller, sellerInput, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(3);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P, BUYER_KEY), _leg(sellerInput, 2 * P, SELLER_KEY));

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "buyer input swapped");
        assertEq(sellerInput.balanceOf(seller), 0, "seller input swapped");
    }

    function test_SlippageResidualStaysWithParty() public {
        router.setRate(3, 2); // 2P input -> 3P output, 1P over the bond
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(4);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P, BUYER_KEY), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(bond.balanceOf(buyer), P, "swap surplus over the bond refunded to buyer");
        assertEq(bond.balanceOf(address(coord)), 0, "coordinator holds no bond currency");
    }

    function test_InputResidualRefunded() public {
        _fundInput(buyer, buyerInput, 3 * P); // approve up to 3P, only 2P swapped
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(5);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        // maxInput pulls 3P, but the SIGNED swapData only swaps 2P -> 1P input
        // residual refunded. The route is witness-bound, so the 2P-route
        // signature is what the buyer authorized.
        bytes memory swapData = _swapData(buyerInput, 2 * P, address(coord));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(address(buyerInput), 3 * P, 0, deadline, swapData);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_KEY, digest);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = WitnessSwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: address(buyerInput),
            maxInput: 3 * P,
            permitNonce: 0,
            permitDeadline: deadline,
            permitSignature: abi.encodePacked(r, s, v),
            swapData: swapData
        });

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, leg, _disabled());

        assertEq(buyerInput.balanceOf(buyer), P, "unconsumed input refunded to buyer");
        assertEq(buyerInput.balanceOf(address(coord)), 0, "coordinator holds no input residual");
    }

    function test_RevertWhen_OutputBelowBond() public {
        router.setRate(1, 2); // 2P input -> 1P output, below the 2P bond
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(6);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        // Build the leg first: `_leg` calls `coord.swapWitness`, and that call
        // would otherwise consume the `expectRevert` armed just below.
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(buyerInput, 2 * P, BUYER_KEY);
        WitnessSwapAndCommitCoordinator.SwapFunding memory disabled = _disabled();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(WitnessSwapAndCommitCoordinator.OutputBelowBond.selector, P, 2 * P));
        coord.swapAndCommit(c, bSig, sSig, leg, disabled);
    }

    function test_RevertWhen_NothingToFund() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(7);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        vm.expectRevert(WitnessSwapAndCommitCoordinator.NothingToFund.selector);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _disabled());
    }

    // ── The front-run fix ──────────────────────────────────────────

    /// @notice THE POINT OF THIS SIBLING. In the base SwapAndCommitCoordinator
    ///         `swapData` sat outside every signature, so a relayer could
    ///         substitute its own route — here, rerouting the swap output to
    ///         itself — to capture value the coordinator would otherwise refund
    ///         to the buyer. This asserts that attack is now IMPOSSIBLE: the
    ///         buyer signs a witness over the honest route (output → coordinator),
    ///         the relayer swaps in tampered `swapData` (output → relayer), and
    ///         Permit2 recomputes the witness from the SUBMITTED route, recovers
    ///         a signer that is not the buyer, and reverts before any token moves.
    function test_RevertWhen_SwapDataSubstituted_FrontRunImpossible() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(8);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        // Buyer authorizes (and signs the witness for) the honest route.
        WitnessSwapAndCommitCoordinator.SwapFunding memory honest = _leg(buyerInput, 2 * P, BUYER_KEY);

        // Relayer keeps the buyer's signature but swaps in a self-dealing route.
        WitnessSwapAndCommitCoordinator.SwapFunding memory tampered = honest;
        tampered.swapData = _swapData(buyerInput, 2 * P, relayer);

        vm.prank(relayer);
        vm.expectRevert(MockWitnessPermit2.InvalidSigner.selector);
        coord.swapAndCommit(c, bSig, sSig, tampered, _disabled());
    }

    /// @notice Motivation, asserted structurally: the base coordinator left the
    ///         route unsigned; this sibling binds it, so the witness is a
    ///         function of `swapData`. Two routes → two witnesses → only the
    ///         signed route can verify. (We assert against the base contract's
    ///         weakness WITHOUT touching or importing it — the base coordinator
    ///         stays immutable; the fix ships as this new witness path.)
    function test_WitnessBindsSwapRoute() public view {
        bytes memory routeToCoord = _swapData(buyerInput, 2 * P, address(coord));
        bytes memory routeToRelayer = _swapData(buyerInput, 2 * P, relayer);

        bytes32 wCoord = coord.swapWitness(address(buyerInput), 2 * P, routeToCoord);
        bytes32 wRelayer = coord.swapWitness(address(buyerInput), 2 * P, routeToRelayer);

        assertTrue(wCoord != wRelayer, "witness must change when the swap route changes");

        // The input ceiling is bound too — widening maxInput flips the witness.
        assertTrue(
            coord.swapWitness(address(buyerInput), 2 * P, routeToCoord)
                != coord.swapWitness(address(buyerInput), 3 * P, routeToCoord),
            "witness must change when maxInput changes"
        );
    }
}
