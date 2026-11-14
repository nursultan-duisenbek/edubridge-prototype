// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * Educational project for the course Introduction to Finance.
 * Not a real product, service or investment offer. Do not use with real funds.
 *
 * CredentialRegistry (EduBridge prototype)
 * ----------------------------------------
 * A registry of course-credit records. Approved institutions (issuers) write only a salted
 * hash of a credit record. Names, grades and course data stay off-chain, so no personal data
 * is ever written to the blockchain. Anyone with the hash can verify its status.
 *
 * Roles
 *  - DEFAULT_ADMIN_ROLE: grants and revokes roles (in production a multisignature wallet).
 *  - OPERATOR_ROLE: approves, suspends and reinstates issuers, pauses the contract.
 *  - Approved issuer (a mapping, not a role): issues, batch-issues and revokes its OWN records.
 *
 * The contract holds no funds and makes no external calls, so reentrancy is not possible.
 * Fees are invoiced off-chain in tenge and no token exists.
 */
contract CredentialRegistry is AccessControl, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant MAX_BATCH = 200;

    enum Status {
        Unknown,
        Valid,
        Revoked
    }

    struct Issuer {
        bool registered;
        bool active;
        bytes32 nameCode; // short code of the institution, e.g. a keccak of its public name
    }

    struct Credential {
        address issuer;
        uint64 issuedAt;
        uint8 credType; // 1 = course credit, 2 = summer school, 3 = online course (prototype values)
        Status status;
        bytes32 reasonCode; // set on revocation
    }

    mapping(address => Issuer) private _issuers;
    mapping(bytes32 => Credential) private _credentials;

    event IssuerRegistered(address indexed issuer, bytes32 nameCode);
    event IssuerSuspended(address indexed issuer);
    event IssuerReinstated(address indexed issuer);
    event CredentialIssued(bytes32 indexed credentialHash, address indexed issuer, uint8 credType);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer, bytes32 reasonCode);

    error NotAnActiveIssuer();
    error IssuerAlreadyRegistered();
    error IssuerNotRegistered();
    error AlreadyRecorded();
    error UnknownCredential();
    error NotCredentialIssuer();
    error AlreadyRevoked();
    error EmptyHash();
    error BatchTooLarge();
    error EmptyBatch();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // ------------------------------------------------------------------ operator functions

    function registerIssuer(address issuer, bytes32 nameCode) external onlyRole(OPERATOR_ROLE) {
        if (_issuers[issuer].registered) revert IssuerAlreadyRegistered();
        _issuers[issuer] = Issuer({registered: true, active: true, nameCode: nameCode});
        emit IssuerRegistered(issuer, nameCode);
    }

    function suspendIssuer(address issuer) external onlyRole(OPERATOR_ROLE) {
        if (!_issuers[issuer].registered) revert IssuerNotRegistered();
        _issuers[issuer].active = false;
        emit IssuerSuspended(issuer);
    }

    function reinstateIssuer(address issuer) external onlyRole(OPERATOR_ROLE) {
        if (!_issuers[issuer].registered) revert IssuerNotRegistered();
        _issuers[issuer].active = true;
        emit IssuerReinstated(issuer);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------ issuer functions

    function issue(bytes32 credentialHash, uint8 credType) external whenNotPaused {
        _issue(credentialHash, credType);
    }

    /// Records many credit records in one transaction, for example at the end of a semester.
    function issueBatch(bytes32[] calldata hashes, uint8 credType) external whenNotPaused {
        if (hashes.length == 0) revert EmptyBatch();
        if (hashes.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i = 0; i < hashes.length; i++) {
            _issue(hashes[i], credType);
        }
    }

    function revoke(bytes32 credentialHash, bytes32 reasonCode) external whenNotPaused {
        Credential storage c = _credentials[credentialHash];
        if (c.status == Status.Unknown) revert UnknownCredential();
        if (c.issuer != msg.sender) revert NotCredentialIssuer();
        if (c.status == Status.Revoked) revert AlreadyRevoked();
        c.status = Status.Revoked;
        c.reasonCode = reasonCode;
        emit CredentialRevoked(credentialHash, msg.sender, reasonCode);
    }

    // ------------------------------------------------------------------ verifier function (read-only)

    /// Read-only: costs nothing on the network. If the issuer was suspended, the record is still
    /// returned but `issuerActive` is false, so the verifier sees a warning flag.
    function verify(bytes32 credentialHash)
        external
        view
        returns (Status status, address issuer, bytes32 issuerNameCode, uint64 issuedAt, bool issuerActive)
    {
        Credential storage c = _credentials[credentialHash];
        if (c.status == Status.Unknown) {
            return (Status.Unknown, address(0), bytes32(0), 0, false);
        }
        Issuer storage i = _issuers[c.issuer];
        return (c.status, c.issuer, i.nameCode, c.issuedAt, i.active);
    }

    function getIssuer(address issuer) external view returns (bool registered, bool active, bytes32 nameCode) {
        Issuer storage i = _issuers[issuer];
        return (i.registered, i.active, i.nameCode);
    }

    // ------------------------------------------------------------------ internal

    function _issue(bytes32 credentialHash, uint8 credType) private {
        if (!_issuers[msg.sender].active) revert NotAnActiveIssuer();
        if (credentialHash == bytes32(0)) revert EmptyHash();
        if (_credentials[credentialHash].status != Status.Unknown) revert AlreadyRecorded();
        _credentials[credentialHash] = Credential({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            credType: credType,
            status: Status.Valid,
            reasonCode: bytes32(0)
        });
        emit CredentialIssued(credentialHash, msg.sender, credType);
    }
}
