// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAssemblyValidator} from "./IAssemblyValidator.sol";

/// @title AssemblyRegistry — Permissionless assembly anchoring
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for assembly registration.
///         Parallel to `SchemaRegistry` (schemas) and `OperatorRegistry`
///         (operators) — each artifact family carries its own anchor per
///         the protocol's separation-of-concerns doctrine.
///
///         An assembly is a composition template that USES schemas. The
///         registry binds a slug to (classId, contentHash, metadataURI):
///         the slug is the human-readable identifier; classId names the
///         assembly class (e.g. "direct-sale-v1"); contentHash is the
///         keccak256 of the ABI-encoded manifest; metadataURI points to
///         off-chain content (typically IPFS).
///
///         Registration is gated by the class's `IAssemblyValidator`: the
///         registry looks up the validator for `classId` and calls
///         `validate(classId, content)` — if validation reverts, registration
///         reverts. This makes registration *typed*: a slug registered under
///         "direct-sale-v1" is guaranteed to conform to direct-sale's
///         on-chain invariants.
///
///         No owner, no admin, no fee. Slug binding is first-write-wins and
///         permanent — no transferAssembly, no removeAssembly. Authors who
///         want to publish a revised assembly register a new slug.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
///
///         Validators are bound permanently per classId via `setValidator`.
///         Once set, the binding cannot be replaced — preserves the same
///         "no admin" / "no rug" invariant SchemaRegistry has.
contract AssemblyRegistry {
    struct AssemblyBinding {
        address author;
        bytes32 classId;
        bytes32 contentHash;
        string metadataURI;
        uint64 registeredAt;
    }

    /// @notice slugHash (keccak256 of slug bytes) → binding details.
    mapping(bytes32 => AssemblyBinding) public bindings;

    /// @notice classId → validator. First-write-wins.
    mapping(bytes32 => IAssemblyValidator) public validators;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when a class validator is bound.
    /// @param classId    The assembly class.
    /// @param validator  Validator contract address.
    /// @param registrar  Address that bound the validator.
    event ValidatorBound(bytes32 indexed classId, address indexed validator, address indexed registrar);

    /// @notice Emitted when an assembly is registered.
    /// @param slugHash     keccak256 of the slug.
    /// @param classId      Assembly class (e.g. keccak256("direct-sale-v1")).
    /// @param author       Address that registered the assembly.
    /// @param slug         Human-readable slug (full string).
    /// @param contentHash  keccak256 of the ABI-encoded manifest.
    /// @param metadataURI  Off-chain manifest URI (typically IPFS).
    event AssemblyRegistered(
        bytes32 indexed slugHash,
        bytes32 indexed classId,
        address indexed author,
        string slug,
        bytes32 contentHash,
        string metadataURI
    );

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptySlug();
    error EmptyMetadataURI();
    error SlugAlreadyRegistered(string slug);
    error ValidatorAlreadyBound(bytes32 classId);
    error ValidatorNotSet(bytes32 classId);
    error ValidatorClassMismatch(bytes32 expected, bytes32 got);

    // ── Validator binding (permissionless, first-write-wins) ───────────

    /// @notice Bind a validator to an assembly class. Reverts if the class
    ///         already has a validator bound, or if the validator's
    ///         `assemblyClassId()` doesn't match the supplied `classId`.
    function setValidator(bytes32 classId, IAssemblyValidator validator) external {
        if (address(validators[classId]) != address(0)) revert ValidatorAlreadyBound(classId);
        bytes32 validatorClassId = validator.assemblyClassId();
        if (validatorClassId != classId) revert ValidatorClassMismatch(classId, validatorClassId);
        validators[classId] = validator;
        emit ValidatorBound(classId, address(validator), msg.sender);
    }

    // ── Assembly registration (permissionless, first-write-wins) ────────

    /// @notice Register an assembly. Gated by the class's validator.
    /// @param slug         Human-readable slug. Bound permanently.
    /// @param classId      Assembly class. Must have a validator bound.
    /// @param content      ABI-encoded manifest. Passed to the validator.
    /// @param metadataURI  Off-chain manifest pointer (typically IPFS).
    function registerAssembly(
        string calldata slug,
        bytes32 classId,
        bytes calldata content,
        string calldata metadataURI
    ) external {
        if (bytes(slug).length == 0) revert EmptySlug();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();

        bytes32 slugHash = keccak256(bytes(slug));
        if (bindings[slugHash].registeredAt != 0) revert SlugAlreadyRegistered(slug);

        IAssemblyValidator validator = validators[classId];
        if (address(validator) == address(0)) revert ValidatorNotSet(classId);

        // Validator reverts on invalid manifest; staticcall via `view`.
        validator.validate(classId, content);

        bytes32 contentHash = keccak256(content);
        bindings[slugHash] = AssemblyBinding({
            author: msg.sender,
            classId: classId,
            contentHash: contentHash,
            metadataURI: metadataURI,
            registeredAt: uint64(block.timestamp)
        });

        emit AssemblyRegistered(slugHash, classId, msg.sender, slug, contentHash, metadataURI);
    }
}
