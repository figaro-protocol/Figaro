// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGEN16258V1Validator} from "../../src/clauseValidators/FigaroGHGEN16258V1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGEN16258V1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGEN16258V1Validator();
        ID = keccak256(abi.encode("figaro-ghg-en-16258", uint64(1)));
    }
}
