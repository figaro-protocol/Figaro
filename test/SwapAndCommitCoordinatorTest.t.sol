// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FigaroCore.sol";
import "../src/CommitmentTypes.sol";
import "../src/SwapAndCommitCoordinator.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockPermit2.sol";
import "../src/mocks/MockUniversalRouter.sol";

/// @title SwapAndCommitCoordinatorTest — buyer/seller pay the bond in a different token
contract SwapAndCommitCoordinatorTest is Test {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore internal core;
    MockPermit2 internal permit2;
    MockUniversalRouter internal router;
    SwapAndCommitCoordinator internal coord;

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
        permit2 = new MockPermit2();
        router = new MockUniversalRouter();
        coord = new SwapAndCommitCoordinator(address(core), address(permit2), address(router));

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
            agreementHash: keccak256("swap-commit-root"),
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

    /// @dev A swap-funding leg paying `bondAmount` of bond currency from `amountIn`
    ///      of `input`, routed through the mock router back to the coordinator.
    function _leg(MockERC20 input, uint256 amountIn) internal view returns (SwapAndCommitCoordinator.SwapFunding memory) {
        return SwapAndCommitCoordinator.SwapFunding({
            enabled: true,
            inputToken: address(input),
            maxInput: amountIn,
            permitNonce: 0,
            permitDeadline: block.timestamp + 1 hours,
            permitSignature: "",
            swapData: abi.encodeCall(MockUniversalRouter.swap, (address(input), address(bond), amountIn, address(coord)))
        });
    }

    function _disabled() internal pure returns (SwapAndCommitCoordinator.SwapFunding memory f) {
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

    // ── Tests ─────────────────────────────────────────────────────

    function test_BuyerPaysDifferentToken() public {
        _fundInput(buyer, buyerInput, 2 * P); // rate 1:1, needs 2P input for 2P bond
        _selfFundBond(seller, 2 * P); // seller self-funds its 2P bond in USDC

        CommitmentTypes.Commitment memory c = _rootCommitment(1);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P), _disabled());

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
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _leg(sellerInput, 2 * P));

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
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P), _leg(sellerInput, 2 * P));

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
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P), _disabled());

        assertEq(bond.balanceOf(address(core)), 4 * P, "escrow holds both bonds");
        assertEq(bond.balanceOf(buyer), P, "swap surplus over the bond refunded to buyer");
        assertEq(bond.balanceOf(address(coord)), 0, "coordinator holds no bond currency");
    }

    function test_InputResidualRefunded() public {
        _fundInput(buyer, buyerInput, 3 * P); // approve up to 3P, only 2P needed
        _selfFundBond(seller, 2 * P);

        CommitmentTypes.Commitment memory c = _rootCommitment(5);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        // maxInput pulls 3P, but swapData only swaps 2P -> 1P input residual refunded.
        SwapAndCommitCoordinator.SwapFunding memory leg = _leg(buyerInput, 3 * P);
        leg.swapData = abi.encodeCall(MockUniversalRouter.swap, (address(buyerInput), address(bond), 2 * P, address(coord)));

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

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(SwapAndCommitCoordinator.OutputBelowBond.selector, P, 2 * P));
        coord.swapAndCommit(c, bSig, sSig, _leg(buyerInput, 2 * P), _disabled());
    }

    function test_RevertWhen_NothingToFund() public {
        CommitmentTypes.Commitment memory c = _rootCommitment(7);
        bytes memory bSig = _sign(c, BUYER_KEY);
        bytes memory sSig = _sign(c, SELLER_KEY);

        vm.prank(relayer);
        vm.expectRevert(SwapAndCommitCoordinator.NothingToFund.selector);
        coord.swapAndCommit(c, bSig, sSig, _disabled(), _disabled());
    }
}
