// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "src/core/kernel/FigaroCore.sol";
import "src/core/kernel/CommitmentTypes.sol";
import "src/composability/WitnessSwapAndCommitCoordinator.sol";
import "src/mocks/MockERC20.sol";
import "src/mocks/MockReentrantToken.sol";
import "src/mocks/MockSwapVenue.sol";
import "src/mocks/MockWitnessPermit2.sol";
import {SigningTestHelper} from "test/helpers/SigningTestHelper.sol";

/// @title WitnessSwapAndCommitCoordinatorTest — the swap route carries a signed witness
/// @notice Covers WitnessSwapAndCommitCoordinator end to end: every leg
///         carries a real Permit2 WITNESS signature, and adds the front-run
///         proof: a substituted `swapData` fails signature verification.
contract WitnessSwapAndCommitCoordinatorTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    /// @dev The Core's domain, read from it once deployed: a signature made
    ///      after a cheatcode (`vm.prank`, `vm.expectRevert`) reads no contract,
    ///      so the cheatcode reaches the call under test.
    bytes32 internal coreDomain;
    MockWitnessPermit2 internal permit2;
    MockSwapVenue internal router;
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
    uint8 internal constant BUYER = 0; // WitnessSwapAndCommitCoordinator.BUYER_ROLE
    uint8 internal constant SELLER = 1; // WitnessSwapAndCommitCoordinator.SELLER_ROLE

    function setUp() public {
        buyer = vm.addr(BUYER_KEY);
        seller = vm.addr(SELLER_KEY);

        core = new FigaroCore();

        coreDomain = core.DOMAIN_SEPARATOR();
        permit2 = new MockWitnessPermit2();
        router = new MockSwapVenue();
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
            token: address(bond),
            payment: P,
            runningTotal: P,
            checkoutHash: keccak256("witness-swap-commit-root"),
            salt: salt,
            commitDeadline: block.timestamp + 1 hours
        });
    }

    /// @dev Build the swap calldata for a leg routing `amountIn` of `input` to
    ///      `recipient` (normally the coordinator).
    function _swapData(MockERC20 input, uint256 amountIn, address recipient) internal view returns (bytes memory) {
        return abi.encodeCall(MockSwapVenue.swap, (address(input), address(bond), amountIn, recipient));
    }

    /// @dev The Permit2 witness digest a party signs, reconstructed with the
    ///      SAME rules as MockWitnessPermit2 (spender = the coordinator), for
    ///      the leg funding `role`'s bond of commitment `c`.
    function _permitDigest(
        CommitmentTypes.Commitment memory c,
        uint8 role,
        address inputToken,
        uint256 maxInput,
        uint256 nonce,
        uint256 deadline,
        bytes memory swapData
    ) internal view returns (bytes32) {
        bytes32 witness = coord.swapWitness(inputToken, maxInput, swapData, c.hashStruct(), role);
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
        return SigningTestHelper.typedDataHash(permit2.DOMAIN_SEPARATOR(), structHash);
    }

    /// @dev A witness-signed swap-funding leg: swaps `amountIn` of `input` to the
    ///      bond currency, routed to the coordinator, with a Permit2 witness
    ///      signature by `partyKey` over that exact route, for `role`'s bond of
    ///      commitment `c`.
    function _leg(CommitmentTypes.Commitment memory c, uint8 role, MockERC20 input, uint256 amountIn, uint256 partyKey)
        internal
        view
        returns (WitnessSwapAndCommitCoordinator.SwapFunding memory)
    {
        bytes memory swapData = _swapData(input, amountIn, address(coord));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(c, role, address(input), amountIn, 0, deadline, swapData);
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

    /// @dev Give a party `amountIn` of `input` + a Permit2 approval of the
    ///      maximum, which covers each swap's signed maximum input.
    function _fundInput(address party, MockERC20 input, uint256 amountIn) internal {
        input.mint(party, amountIn);
        vm.prank(party);
        input.approve(address(permit2), type(uint256).max);
    }

    /// @dev Give a self-funding party `bondAmount` of bond currency directly.
    function _selfFundBond(address party, uint256 bondAmount) internal {
        bond.mint(party, bondAmount);
    }

    // ── Witness-signed coverage ──────────────────────────────────────

    function test_BuyerPaysDifferentToken() public {
        _fundInput(buyer, buyerInput, 2 * P); // rate 1:1, needs 2P input for 2P bond
        _selfFundBond(seller, 2 * P); // seller self-funds its 2P bond in USDC

        CommitmentTypes.Commitment memory c = _rootCommitment(1);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "buyer input fully swapped");
        assertEq(bond.balanceOf(buyer), 0, "buyer funded then pulled, no residual at 1:1");
        assertEq(bond.balanceOf(seller), 0, "seller bond pulled from self-funded balance");
    }

    function test_SellerPaysDifferentToken() public {
        _selfFundBond(buyer, 2 * P); // buyer self-funds its 2P bond in USDC
        _fundInput(seller, sellerInput, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(2);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _leg(c, SELLER, sellerInput, 2 * P, SELLER_KEY));

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(sellerInput.balanceOf(seller), 0, "seller input fully swapped");
        assertEq(bond.balanceOf(seller), 0, "seller funded then pulled");
    }

    function test_BothSidesSwap() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _fundInput(seller, sellerInput, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(3);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(
            c, bSig, sSig, _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY), _leg(c, SELLER, sellerInput, 2 * P, SELLER_KEY)
        );

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(buyerInput.balanceOf(buyer), 0, "buyer input swapped");
        assertEq(sellerInput.balanceOf(seller), 0, "seller input swapped");
    }

    function test_SlippageResidualStaysWithParty() public {
        router.setRate(3, 2); // 2P input -> 3P output, 1P over the bond
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(4);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(bond.balanceOf(buyer), P, "swap surplus over the bond refunded to buyer");
        assertEq(bond.balanceOf(address(coord)), 0, "coordinator holds no bond currency");
    }

    function test_InputResidualRefunded() public {
        _fundInput(buyer, buyerInput, 3 * P); // approve up to 3P, only 2P swapped
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(5);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        // maxInput pulls 3P, but the SIGNED swapData only swaps 2P -> 1P input
        // residual refunded. The route is witness-bound, so the 2P-route
        // signature is what the buyer authorized.
        bytes memory swapData = _swapData(buyerInput, 2 * P, address(coord));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(c, BUYER, address(buyerInput), 3 * P, 0, deadline, swapData);
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

    /// @dev The router's allowance is zeroed after the swap. Asserted on the
    ///      partial-consumption route (maxInput 3P, swap takes 2P) — the one
    ///      where a leftover approval would actually stand.
    function test_RouterAllowanceZeroedAfterSwap() public {
        _fundInput(buyer, buyerInput, 3 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(11);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        bytes memory swapData = _swapData(buyerInput, 2 * P, address(coord));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(c, BUYER, address(buyerInput), 3 * P, 0, deadline, swapData);
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

        assertEq(buyerInput.allowance(address(coord), address(router)), 0, "router allowance zeroed after swap");
    }

    /// @dev A zero residual is never transferred: a token that rejects
    ///      zero-value transfers must not brick the fully-consumed route.
    function test_ZeroInputResidual_NoZeroTransfer() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(12);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.mockCallRevert(
            address(buyerInput), abi.encodeWithSelector(IERC20.transfer.selector, buyer, 0), "zero-value transfer"
        );
        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "commit succeeded without a zero-value refund transfer");
    }

    function test_RevertWhen_OutputBelowBond() public {
        router.setRate(1, 2); // 2P input -> 1P output, below the 2P bond
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(6);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        // Build the leg first: `_leg` calls `coord.swapWitness`, and that call
        // would otherwise consume the `expectRevert` armed just below.
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY);
        WitnessSwapAndCommitCoordinator.SwapFunding memory disabled = _disabled();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(WitnessSwapAndCommitCoordinator.OutputBelowBond.selector, P, 2 * P));
        coord.swapAndCommit(c, bSig, sSig, leg, disabled);
    }

    function test_RevertWhen_SwapCallFailed() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(9);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        // A route the venue cannot execute: the selector matches no function
        // on the router and it has no fallback, so the forwarded call returns
        // false. The buyer's witness is signed over THIS route, so Permit2
        // accepts the leg and the coordinator reaches the router call itself.
        bytes memory swapData = abi.encodeWithSignature("noSuchRoute()");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _permitDigest(c, BUYER, address(buyerInput), 2 * P, 0, deadline, swapData);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_KEY, digest);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = WitnessSwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: address(buyerInput),
            maxInput: 2 * P,
            permitNonce: 0,
            permitDeadline: deadline,
            permitSignature: abi.encodePacked(r, s, v),
            swapData: swapData
        });
        WitnessSwapAndCommitCoordinator.SwapFunding memory disabled = _disabled();

        vm.prank(relayer);
        vm.expectRevert(WitnessSwapAndCommitCoordinator.SwapCallFailed.selector);
        coord.swapAndCommit(c, bSig, sSig, leg, disabled);
    }

    function test_RevertWhen_NothingToFund() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(7);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.prank(relayer);
        vm.expectRevert(WitnessSwapAndCommitCoordinator.NothingToFund.selector);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _disabled());
    }

    // ── The front-run fix ──────────────────────────────────────────

    /// @notice THE POINT OF THIS TEST: `swapData` is bound by the buyer's Permit2
    ///         witness, so a relayer cannot substitute its own route — here,
    ///         rerouting the swap output to itself — to capture value the
    ///         coordinator would otherwise refund to the buyer. This asserts
    ///         that attack is IMPOSSIBLE: the buyer signs a witness over the
    ///         honest route (output → coordinator), the relayer swaps in
    ///         tampered `swapData` (output → relayer), and Permit2 recomputes
    ///         the witness from the SUBMITTED route, recovers a signer that is
    ///         not the buyer, and reverts before any token moves.
    function test_RevertWhen_SwapDataSubstituted_FrontRunImpossible() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(8);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        // Buyer authorizes (and signs the witness for) the honest route.
        WitnessSwapAndCommitCoordinator.SwapFunding memory honest = _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY);

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

        bytes32 h = _rootCommitment(40).hashStruct();
        bytes32 wCoord = coord.swapWitness(address(buyerInput), 2 * P, routeToCoord, h, BUYER);
        bytes32 wRelayer = coord.swapWitness(address(buyerInput), 2 * P, routeToRelayer, h, BUYER);

        assertTrue(wCoord != wRelayer, "witness must change when the swap route changes");

        // The input ceiling is bound too — widening maxInput flips the witness.
        assertTrue(
            coord.swapWitness(address(buyerInput), 2 * P, routeToCoord, h, BUYER)
                != coord.swapWitness(address(buyerInput), 3 * P, routeToCoord, h, BUYER),
            "witness must change when maxInput changes"
        );

        // So are the commitment and the role.
        assertTrue(
            wCoord
                != coord.swapWitness(address(buyerInput), 2 * P, routeToCoord, _rootCommitment(41).hashStruct(), BUYER),
            "witness must change when the commitment changes"
        );
        assertTrue(
            wCoord != coord.swapWitness(address(buyerInput), 2 * P, routeToCoord, h, SELLER),
            "witness must change when the role changes"
        );
    }

    // ── The coordinator never signs, never holds, never resolves ──

    /// @dev A contract has no key, so no signature recovers to its address: a
    ///      commitment naming the coordinator as buyer fails FigaroCore's ECDSA
    ///      recovery. Tried straight at the Core and through the coordinator.
    function test_CoordinatorCannotBeBuyer() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(20);
        c.buyer = address(coord);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.expectRevert(FigaroCore.InvalidBuyerSignature.selector);
        core.commit(c, bSig, sSig);

        _fundInput(seller, sellerInput, 2 * P);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(c, SELLER, sellerInput, 2 * P, SELLER_KEY);
        vm.prank(relayer);
        vm.expectRevert(FigaroCore.InvalidBuyerSignature.selector);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), leg);
    }

    function test_CoordinatorCannotBeSeller() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(21);
        c.seller = address(coord);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);

        vm.expectRevert(FigaroCore.InvalidSellerSignature.selector);
        core.commit(c, bSig, sSig);

        _fundInput(buyer, buyerInput, 2 * P);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY);
        vm.prank(relayer);
        vm.expectRevert(FigaroCore.InvalidSellerSignature.selector);
        coord.swapAndCommit(c, bSig, sSig, leg, _disabled());
    }

    /// @dev Only the root buyer's own address resolves. A call from the
    ///      coordinator's address is refused.
    function test_CoordinatorCannotResolve() public {
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(seller, 2 * P);
        CommitmentTypes.Commitment memory c = _rootCommitment(22);
        vm.prank(relayer);
        (bytes32 processId,) = coord.swapAndCommit(
            c,
            SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY),
            SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY),
            _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY),
            _disabled()
        );

        CommitmentTypes.Commitment[] memory cs = new CommitmentTypes.Commitment[](1);
        cs[0] = c;
        cs[0].processId = processId;
        vm.prank(address(coord));
        vm.expectRevert(FigaroCore.NotProcessBuyer.selector);
        core.resolveProcess(processId, cs);
    }

    /// @dev After a swap-funded order lands with both legs swapped and a surplus
    ///      on each, the coordinator holds none of the three tokens.
    function test_CoordinatorHoldsNoTokenAfterBothLegs() public {
        router.setRate(3, 2);
        _fundInput(buyer, buyerInput, 2 * P);
        _fundInput(seller, sellerInput, 2 * P);
        CommitmentTypes.Commitment memory c = _rootCommitment(23);
        vm.prank(relayer);
        coord.swapAndCommit(
            c,
            SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY),
            SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY),
            _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY),
            _leg(c, SELLER, sellerInput, 2 * P, SELLER_KEY)
        );
        assertEq(bond.balanceOf(address(coord)), 0, "no bond currency");
        assertEq(buyerInput.balanceOf(address(coord)), 0, "no buyer input");
        assertEq(sellerInput.balanceOf(address(coord)), 0, "no seller input");
    }

    // ── No call re-enters while a swap is under way ──────────────

    /// @notice The input token is the party's choice, so its code runs inside
    ///         `swapAndCommit`. A token that calls `swapAndCommit` again while
    ///         Permit2 pulls it is refused by the guard, by the guard's own
    ///         error, and the order it was funding still commits.
    function test_AnInputTokenThatCallsBackIsRefusedByTheGuard() public {
        MockReentrantToken hostile = new MockReentrantToken();
        MockERC20 input = MockERC20(address(hostile));
        _fundInput(buyer, input, 2 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(31);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, c, SELLER_KEY);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(c, BUYER, input, 2 * P, BUYER_KEY);

        hostile.arm(address(coord), abi.encodeCall(coord.swapAndCommit, (c, bSig, sSig, leg, _disabled())));
        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, leg, _disabled());

        assertTrue(hostile.reentryAttempted(), "the token called back");
        assertTrue(hostile.reentryBlocked(), "the call back was refused");
        assertEq(
            hostile.reentryRevertSelector(),
            ReentrancyGuard.ReentrancyGuardReentrantCall.selector,
            "refused by the guard, by its own error"
        );
        assertEq(bond.balanceOf(address(core)), 4 * P, "the order committed once, with both bonds");
        assertEq(hostile.balanceOf(address(coord)), 0, "the coordinator holds none of the input");
    }

    // ── The leg is bound to its commitment and its role ──────────

    /// @notice A leg the buyer signed for an order that never committed is
    ///         refused when a third address spends it on another commitment
    ///         both parties signed: the witness carries the struct hash of
    ///         the one commitment the leg funds.
    function test_RevertWhen_LegSpentOnAnotherCommitment() public {
        _fundInput(buyer, buyerInput, 4 * P);
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory signedFor = _rootCommitment(30); // never commits
        CommitmentTypes.Commitment memory other = _rootCommitment(31);
        WitnessSwapAndCommitCoordinator.SwapFunding memory leg = _leg(signedFor, BUYER, buyerInput, 2 * P, BUYER_KEY);
        bytes memory bSig = SigningTestHelper.signCommitment(coreDomain, other, BUYER_KEY);
        bytes memory sSig = SigningTestHelper.signCommitment(coreDomain, other, SELLER_KEY);
        WitnessSwapAndCommitCoordinator.SwapFunding memory disabled = _disabled();

        vm.prank(address(0xA77AC4));
        vm.expectRevert(MockWitnessPermit2.InvalidSigner.selector);
        coord.swapAndCommit(other, bSig, sSig, leg, disabled);
    }

    /// @notice One wallet may be both buyer and seller of an order. A leg it
    ///         signed as buyer is refused in the seller's place.
    function test_RevertWhen_LegUsedUnderTheWrongRole() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(32);
        c.seller = buyer;
        _fundInput(buyer, buyerInput, 2 * P);
        _selfFundBond(buyer, 2 * P);
        WitnessSwapAndCommitCoordinator.SwapFunding memory asBuyer = _leg(c, BUYER, buyerInput, 2 * P, BUYER_KEY);
        // The same wallet's leg as seller of the same order is accepted.
        WitnessSwapAndCommitCoordinator.SwapFunding memory asSeller = _leg(c, SELLER, buyerInput, 2 * P, BUYER_KEY);
        bytes memory sig = SigningTestHelper.signCommitment(coreDomain, c, BUYER_KEY);
        WitnessSwapAndCommitCoordinator.SwapFunding memory disabled = _disabled();

        vm.prank(relayer);
        vm.expectRevert(MockWitnessPermit2.InvalidSigner.selector);
        coord.swapAndCommit(c, sig, sig, disabled, asBuyer);

        vm.prank(relayer);
        coord.swapAndCommit(c, sig, sig, disabled, asSeller);
        assertEq(bond.balanceOf(address(core)), 4 * P, "the leg signed for the seller's place funds it");
    }
}
