// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGCustomV1Validator} from "../../src/clauseValidators/FigaroGHGCustomV1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGCustomV1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGCustomV1Validator();
        ID = keccak256(abi.encode("figaro-ghg-custom", uint64(1)));
    }
}
