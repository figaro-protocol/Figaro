// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FigaroGHGProtocolV1Validator} from "../../src/schemaValidators/FigaroGHGProtocolV1Validator.sol";
import {FigaroGHGScopeValidatorTestBase} from "./FigaroGHGScopeValidatorTestBase.sol";

contract FigaroGHGProtocolV1ValidatorTest is FigaroGHGScopeValidatorTestBase {
    function setUp() public {
        validator = new FigaroGHGProtocolV1Validator();
        ID = keccak256("figaro-ghg-protocol-v1");
    }
}
