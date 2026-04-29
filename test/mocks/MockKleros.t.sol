// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockKlerosArbitrator} from "../../src/mocks/MockKlerosArbitrator.sol";
import {MockKlerosArbitrableProxy} from "../../src/mocks/MockKlerosArbitrableProxy.sol";

contract MockKlerosArbitratorTest is Test {
    MockKlerosArbitrator arb;

    function setUp() public {
        vm.chainId(31337);
        arb = new MockKlerosArbitrator();
    }

    function test_returnsFixedCost() public view {
        assertEq(arb.arbitrationCost(""), 0.01 ether);
    }

    function test_costIgnoresExtraData() public view {
        assertEq(arb.arbitrationCost(hex"01"), 0.01 ether);
        assertEq(arb.arbitrationCost(hex"deadbeef"), 0.01 ether);
        assertEq(arb.arbitrationCost(hex"00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003"), 0.01 ether);
    }

    function test_revertsOnNonAnvilChain() public {
        vm.chainId(1);
        vm.expectRevert(MockKlerosArbitrator.MockOnlyOnAnvil.selector);
        new MockKlerosArbitrator();
    }
}

contract MockKlerosArbitrableProxyTest is Test {
    MockKlerosArbitrator arb;
    MockKlerosArbitrableProxy proxy;
    address operator;
    address participant;

    bytes constant DEFAULT_EXTRA_DATA =
        hex"00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003";

    function setUp() public {
        vm.chainId(31337);
        operator = makeAddr("operator");
        participant = makeAddr("participant");

        vm.prank(operator);
        arb = new MockKlerosArbitrator();
        vm.prank(operator);
        proxy = new MockKlerosArbitrableProxy(address(arb));

        vm.deal(participant, 1 ether);
    }

    function test_constructorRecordsArbitratorAndOwner() public view {
        assertEq(proxy.arbitrator(), address(arb));
        assertEq(proxy.owner(), operator);
        assertEq(proxy.nextLocalID(), 0);
    }

    function test_createDisputeReturnsMonotonicID() public {
        vm.prank(participant);
        uint256 id0 =
            proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta1", 2);
        assertEq(id0, 0);

        vm.prank(participant);
        uint256 id1 =
            proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta2", 2);
        assertEq(id1, 1);

        assertEq(proxy.nextLocalID(), 2);
    }

    function test_createDisputeRevertsOnInsufficientCost() public {
        vm.expectRevert(MockKlerosArbitrableProxy.InsufficientArbitrationCost.selector);
        vm.prank(participant);
        proxy.createDispute{value: 0.001 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);
    }

    function test_createDisputeEmitsMetaEvidenceAndDispute() public {
        vm.expectEmit(true, true, true, true);
        emit MockKlerosArbitrableProxy.MetaEvidence(0, "/ipfs/QmMeta");
        vm.expectEmit(true, true, true, true);
        emit MockKlerosArbitrableProxy.Dispute(address(arb), 0, 0, 0);

        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);
    }

    function test_disputesGetterShapeMatchesKleros() public {
        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);

        (bytes memory extraData, bool isRuled, uint256 ruling, uint256 externalID) = proxy.disputes(0);
        assertEq(extraData, DEFAULT_EXTRA_DATA);
        assertFalse(isRuled);
        assertEq(ruling, 0);
        assertEq(externalID, 0);
    }

    function test_submitEvidenceEmitsEvidenceEvent() public {
        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);

        vm.expectEmit(true, true, true, true);
        emit MockKlerosArbitrableProxy.Evidence(address(arb), 0, participant, "/ipfs/QmEvidence");
        vm.prank(participant);
        proxy.submitEvidence(0, "/ipfs/QmEvidence");
    }

    function test_submitEvidenceRevertsOnUnknownDispute() public {
        vm.expectRevert(MockKlerosArbitrableProxy.UnknownDispute.selector);
        vm.prank(participant);
        proxy.submitEvidence(0, "/ipfs/QmEvidence");
    }

    function test_externalIDtoLocalID_isIdentity() public view {
        assertEq(proxy.externalIDtoLocalID(0), 0);
        assertEq(proxy.externalIDtoLocalID(42), 42);
        assertEq(proxy.externalIDtoLocalID(type(uint256).max), type(uint256).max);
    }

    function test_mockSetRulingFlipsState() public {
        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);

        vm.expectEmit(true, true, true, true);
        emit MockKlerosArbitrableProxy.Ruling(address(arb), 0, 1);

        vm.prank(operator);
        proxy.mockSetRuling(0, 1);

        (, bool isRuled, uint256 ruling,) = proxy.disputes(0);
        assertTrue(isRuled);
        assertEq(ruling, 1);
    }

    function test_mockSetRulingRevertsForNonOwner() public {
        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);

        vm.expectRevert(MockKlerosArbitrableProxy.OwnerOnly.selector);
        vm.prank(participant);
        proxy.mockSetRuling(0, 1);
    }

    function test_mockSetRulingRevertsOnAlreadyRuled() public {
        vm.prank(participant);
        proxy.createDispute{value: 0.01 ether}(DEFAULT_EXTRA_DATA, "/ipfs/QmMeta", 2);
        vm.prank(operator);
        proxy.mockSetRuling(0, 1);

        vm.expectRevert(MockKlerosArbitrableProxy.AlreadyRuled.selector);
        vm.prank(operator);
        proxy.mockSetRuling(0, 2);
    }

    function test_constructorRevertsOnNonAnvil() public {
        vm.chainId(1);
        vm.expectRevert(MockKlerosArbitrableProxy.MockOnlyOnAnvil.selector);
        new MockKlerosArbitrableProxy(address(arb));
    }

    function test_constructorRevertsOnZeroArbitrator() public {
        vm.expectRevert(MockKlerosArbitrableProxy.InvalidArbitrator.selector);
        new MockKlerosArbitrableProxy(address(0));
    }
}
