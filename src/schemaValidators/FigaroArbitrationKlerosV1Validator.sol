// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISchemaValidator} from "../ISchemaValidator.sol";

/// @title FigaroArbitrationKlerosV1Validator
/// @notice Validates `figaro-arbitration-kleros-v1` content — off-chain dispute
///         resolution via the Kleros decentralized juror court. Selects a
///         Kleros subcourt and a minimum juror count. Compose with
///         `figaro-applicable-law-v1` to add a state-law / ADR recourse layer.
///
/// @dev Content ABI encoding (post-Keystone canonical):
///        `abi.encode(uint8 klerosCourt, uint256 klerosMinJurors)`.
///
///      klerosCourt — position in `["none", "general", "blockchain-nontechnical",
///                    "blockchain-technical", "english-language"]`.
///                    0 = "none" (sentinel; rejected — the clause is meaningless
///                    without a real court, omit the whole clause instead).
///                    1 = general, 2 = blockchain-nontechnical,
///                    3 = blockchain-technical, 4 = english-language.
///                    Must be in [1, 4]; 0 and >4 are rejected.
///      klerosMinJurors — `integer` field; encodes as uint256 per the canonical
///                    rule. 0 = unset (defaults to Kleros's own default of 3
///                    at dispute time); otherwise 1-99. Values above 99 are
///                    rejected.
contract FigaroArbitrationKlerosV1Validator is ISchemaValidator {
    bytes32 public constant override schemaId = keccak256("figaro-arbitration-kleros-v1");

    uint8 internal constant KLEROS_COURT_MIN = 1;
    uint8 internal constant KLEROS_COURT_MAX = 4;
    uint256 internal constant KLEROS_MIN_JURORS_MAX = 99;

    error SchemaIdMismatch(bytes32 got, bytes32 expected);
    error InvalidKlerosCourt(uint8 value);
    error InvalidKlerosMinJurors(uint256 value);
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

        (uint8 klerosCourt, uint256 klerosMinJurors) = abi.decode(content, (uint8, uint256));

        if (klerosCourt < KLEROS_COURT_MIN || klerosCourt > KLEROS_COURT_MAX) {
            revert InvalidKlerosCourt(klerosCourt);
        }
        if (klerosMinJurors > KLEROS_MIN_JURORS_MAX) revert InvalidKlerosMinJurors(klerosMinJurors);
    }
}
