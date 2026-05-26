// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroArbitrationKlerosV1Validator
/// @notice Validates `figaro-arbitration-kleros-v1` content — off-chain dispute
///         resolution via the Kleros decentralized juror court. Selects a
///         Kleros subcourt and a minimum juror count. Compose with
///         `figaro-applicable-law-v1` to add a state-law / ADR recourse layer.
///
/// @dev Content ABI encoding: `abi.encode(uint8 klerosCourt, uint8 klerosMinJurors)`.
///
///      klerosCourt — 1 = general, 2 = blockchain-nontechnical,
///                    3 = blockchain-technical, 4 = english-language.
///                    Must be in [1, 4]; 0 is rejected (the clause is meaningless
///                    without a court — omit the whole clause instead).
///      klerosMinJurors — 0 = unset (defaults to Kleros's own default of 3 at
///                        dispute time); otherwise 1-99.
contract FigaroArbitrationKlerosV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-arbitration-kleros-v1");

    uint8 internal constant KLEROS_COURT_MIN = 1;
    uint8 internal constant KLEROS_COURT_MAX = 4;
    uint8 internal constant KLEROS_MIN_JURORS_MAX = 99;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidKlerosCourt(uint8 value);
    error InvalidKlerosMinJurors(uint8 value);
    /// @dev Runtime `content` must byte-equal the committed clause `sectionData`.
    error SectionDataMismatch();

    function validate(
        bytes32 id,
        uint8,
        /* stage */
        bytes calldata sectionData,
        bytes calldata content
    )
        external
        pure
        override
    {
        if (id != schemaId) revert SchemaIdMismatch(id, schemaId);
        if (keccak256(sectionData) != keccak256(content)) revert SectionDataMismatch();

        (uint8 klerosCourt, uint8 klerosMinJurors) = abi.decode(content, (uint8, uint8));

        if (klerosCourt < KLEROS_COURT_MIN || klerosCourt > KLEROS_COURT_MAX) {
            revert InvalidKlerosCourt(klerosCourt);
        }
        if (klerosMinJurors > KLEROS_MIN_JURORS_MAX) revert InvalidKlerosMinJurors(klerosMinJurors);
    }
}
