// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FigaroProximityProofV1Validator} from "../../src/schemaValidators/FigaroProximityProofV1Validator.sol";

contract FigaroProximityProofV1ValidatorTest is Test {
    FigaroProximityProofV1Validator validator;
    bytes32 constant ID = keccak256("figaro-proximity-proof-v1");
    bytes32 constant NONCE = keccak256("handoff-nonce-1");

    function setUp() public {
        validator = new FigaroProximityProofV1Validator();
    }

    function _validSig() internal pure returns (bytes memory) {
        // 65-byte fixture (r || s || v)
        bytes memory sig = new bytes(65);
        for (uint256 i = 0; i < 65; i++) sig[i] = bytes1(uint8(i + 1));
        return sig;
    }

    function test_schemaIdMatches() public view {
        assertEq(validator.schemaId(), ID);
    }

    // Canonical 0-based positions: 0=zone-wifi, 1=nearby-ble, 2=contact-nfc

    function test_acceptsEachBand() public view {
        for (uint8 b = 0; b <= 2; b++) {
            validator.validate(ID, 0, "", abi.encode(b, NONCE, _validSig()));
        }
    }

    function test_rejectsBandAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityProofV1Validator.InvalidBand.selector, uint8(3)));
        validator.validate(ID, 0, "", abi.encode(uint8(3), NONCE, _validSig()));
    }

    function test_rejectsZeroNonce() public {
        vm.expectRevert(FigaroProximityProofV1Validator.ZeroNonce.selector);
        validator.validate(ID, 0, "", abi.encode(uint8(0), bytes32(0), _validSig()));
    }

    function test_rejectsTooShortSig() public {
        bytes memory shortSig = new bytes(64);
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityProofV1Validator.DeviceSigTooShort.selector, uint256(64)));
        validator.validate(ID, 0, "", abi.encode(uint8(0), NONCE, shortSig));
    }

    function test_rejectsTooLongSig() public {
        bytes memory bigSig = new bytes(513);
        vm.expectRevert(abi.encodeWithSelector(FigaroProximityProofV1Validator.DeviceSigTooLong.selector, uint256(513)));
        validator.validate(ID, 0, "", abi.encode(uint8(0), NONCE, bigSig));
    }

    function test_acceptsContractSig_512Bytes() public view {
        bytes memory eip1271Sig = new bytes(512);
        validator.validate(ID, 0, "", abi.encode(uint8(1), NONCE, eip1271Sig));
    }

    function test_rejectsMismatchedSchemaId() public {
        bytes32 other = keccak256("not-proximity-proof");
        vm.expectRevert(
            abi.encodeWithSelector(FigaroProximityProofV1Validator.SchemaIdMismatch.selector, other, ID)
        );
        validator.validate(other, 0, "", abi.encode(uint8(0), NONCE, _validSig()));
    }
}
