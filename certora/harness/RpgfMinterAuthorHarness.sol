// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/build/rewards/RpgfMinter.sol";

/// @notice RpgfMinter as Certora reads it for `RpgfMinterAuthor.spec`: the
///         contract unchanged, plus one view that calls its own `_isAuthor`, so
///         a rule can name which registry the kind reads.
contract RpgfMinterAuthorHarness is RpgfMinter {
    constructor(
        address _florin,
        address _counter,
        address _clauses,
        address _assemblies,
        address _agreements,
        uint256[] memory _amounts
    ) RpgfMinter(_florin, _counter, _clauses, _assemblies, _agreements, _amounts) {}

    function isAuthor(uint8 kind, bytes32 key, address account) external view returns (bool) {
        return _isAuthor(kind, key, account);
    }
}
