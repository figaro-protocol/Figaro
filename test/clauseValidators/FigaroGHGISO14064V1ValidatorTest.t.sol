// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGISO14064V1Validator} from "../../src/clauseValidators/FigaroGHGISO14064V1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGISO14064V1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGISO14064V1Validator();
        ID = keccak256(abi.encode("figaro-ghg-iso-14064", uint64(1)));
    }
}
