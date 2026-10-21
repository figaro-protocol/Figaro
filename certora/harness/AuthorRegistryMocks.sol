// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The three designer-of-record getters `RpgfMinter` reads, one
///         contract per registry family, each with its own storage, so
///         `RpgfMinterAuthor.spec` can tell which of the three a kind reads.
///         Each answers from two plain mappings the prover leaves arbitrary.
contract ClauseAuthorMock {
    mapping(bytes32 => address) public registeredByOf;
    mapping(bytes32 => bool) public withdrawnOf;

    function depositOf(bytes32 key) external view returns (address registeredBy, bool withdrawn) {
        return (registeredByOf[key], withdrawnOf[key]);
    }
}

contract AssemblyAuthorMock {
    mapping(bytes32 => address) public registeredByOf;
    mapping(bytes32 => bool) public withdrawnOf;

    function bindings(bytes32 key)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI)
    {
        return (registeredByOf[key], 0, withdrawnOf[key], "");
    }
}

contract AgreementAuthorMock {
    mapping(bytes32 => address) public registeredByOf;
    mapping(bytes32 => bool) public withdrawnOf;

    function bindings(bytes32 key)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI)
    {
        return (registeredByOf[key], 0, withdrawnOf[key], "");
    }
}
