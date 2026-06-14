// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGProtocolV1Validator} from "../../src/clauseValidators/FigaroGHGProtocolV1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGProtocolV1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGProtocolV1Validator();
        ID = keccak256(abi.encode("figaro-ghg-protocol", uint64(1)));
    }
}
