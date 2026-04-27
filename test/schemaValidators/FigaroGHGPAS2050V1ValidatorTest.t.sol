// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGPAS2050V1Validator} from "../../src/schemaValidators/FigaroGHGPAS2050V1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGPAS2050V1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGPAS2050V1Validator();
        ID = keccak256("figaro-ghg-pas-2050-v1");
    }
}
