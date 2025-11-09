// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AccessControlRegistry is Ownable {
    constructor() Ownable(msg.sender) {}

    bytes32 public constant ROLE_PATIENT   = keccak256("PATIENT");
    bytes32 public constant ROLE_PHYSICIAN = keccak256("PHYSICIAN");
    bytes32 public constant ROLE_RESPONDER = keccak256("RESPONDER");
    bytes32 public constant ROLE_AUDITOR   = keccak256("AUDITOR");

    struct User {
        address wallet;
        bytes32 role;
        string publicKeyPEM;
        bool exists;
    }

    struct RecordPointer {
        bytes32 recordId;
        string ipfsCid;
        address owner;
        uint256 timestamp;
    }

    struct AccessGrant {
        bool exists;
        address granter;
        address grantee;
        bytes32 recordId;
        uint256 validUntil;
        bytes32 scope;
    }

    struct AccessEvent {
        address actor;
        bytes32 recordId;
        bool success;
        uint256 timestamp;
        string action;
    }

    struct AccessRequest {
        address requester;
        bytes32 recordId;
        string reason;
        bool processed;
        bool approved;
    }

    mapping(address => User) public users;
    mapping(bytes32 => RecordPointer) public records;
    mapping(bytes32 => AccessGrant) public accessGrants;
    mapping(bytes32 => AccessRequest) public accessRequests;
    mapping(bytes32 => AccessEvent[]) private accessEvents;

    event UserRegistered(address indexed wallet, bytes32 indexed role, string publicKeyPEM);
    event RecordAdded(bytes32 indexed recordId, string ipfsCid, address indexed patient);
    event AccessGranted(
        address indexed granter,
        address indexed grantee,
        bytes32 indexed recordId,
        uint256 validUntil,
        bytes32 scope
    );
    event AccessRevoked(address indexed granter, address indexed grantee, bytes32 indexed recordId);
    event AccessEventLogged(
        address indexed actor,
        bytes32 indexed recordId,
        bool success,
        uint256 timestamp,
        string action
    );
    event AccessRequested(
        bytes32 indexed requestId,
        address indexed requester,
        bytes32 indexed recordId,
        string reason
    );
    event AccessRequestApproved(bytes32 indexed requestId);
    event AccessRequestDenied(bytes32 indexed requestId);
    event EmergencyAccess(
        address indexed actor,
        bytes32 indexed recordId,
        string justificationHash,
        uint256 timestamp
    );

    modifier onlyExistingUser() {
        require(users[msg.sender].exists, "User not registered");
        _;
    }

    modifier onlyRole(bytes32 role) {
        require(users[msg.sender].exists && users[msg.sender].role == role, "Invalid role");
        _;
    }

    // ---------- User management ----------

    function registerUser(
        address wallet,
        bytes32 role,
        string calldata publicKeyPEM
    ) external onlyOwner {
        require(wallet != address(0), "Invalid address");
        require(!users[wallet].exists, "User exists");
        users[wallet] = User(wallet, role, publicKeyPEM, true);
        emit UserRegistered(wallet, role, publicKeyPEM);
    }

    // ---------- Records ----------

    function addRecord(
        bytes32 recordId,
        string calldata ipfsCid,
        address patient
    ) external onlyExistingUser {
        require(users[patient].exists && users[patient].role == ROLE_PATIENT, "Invalid patient");
        require(records[recordId].timestamp == 0, "Record exists");

        records[recordId] = RecordPointer(recordId, ipfsCid, patient, block.timestamp);
        emit RecordAdded(recordId, ipfsCid, patient);
    }

    // ---------- Access grants ----------

    function _grantKey(bytes32 recordId, address grantee) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(recordId, grantee));
    }

    function grantAccess(
        address grantee,
        bytes32 recordId,
        uint256 validUntil,
        bytes32 scope
    ) external onlyExistingUser {
        RecordPointer memory rec = records[recordId];
        require(rec.timestamp != 0, "Unknown record");
        require(rec.owner == msg.sender, "Not owner");
        require(validUntil > block.timestamp, "validUntil in past");

        bytes32 key = _grantKey(recordId, grantee);
        accessGrants[key] = AccessGrant(true, msg.sender, grantee, recordId, validUntil, scope);

        emit AccessGranted(msg.sender, grantee, recordId, validUntil, scope);
    }

    function revokeAccess(address grantee, bytes32 recordId) external onlyExistingUser {
        bytes32 key = _grantKey(recordId, grantee);
        AccessGrant storage grantData = accessGrants[key];
        require(grantData.exists, "No grant");
        require(
            grantData.granter == msg.sender || records[recordId].owner == msg.sender,
            "Not allowed"
        );

        delete accessGrants[key];
        emit AccessRevoked(msg.sender, grantee, recordId);
    }

    function hasAccess(address grantee, bytes32 recordId) public view returns (bool) {
        bytes32 key = _grantKey(recordId, grantee);
        AccessGrant storage g = accessGrants[key];
        return g.exists && g.validUntil >= block.timestamp;
    }

    // ---------- Requests ----------

    function requestAccess(
        bytes32 recordId,
        string calldata reason
    ) external onlyExistingUser returns (bytes32 requestId) {
        require(records[recordId].timestamp != 0, "Unknown record");
        requestId = keccak256(abi.encodePacked(msg.sender, recordId, reason, block.timestamp));

        accessRequests[requestId] = AccessRequest(msg.sender, recordId, reason, false, false);
        emit AccessRequested(requestId, msg.sender, recordId, reason);
    }

    function approveRequest(bytes32 requestId) external onlyExistingUser {
        AccessRequest storage r = accessRequests[requestId];
        require(!r.processed, "Processed");
        require(records[r.recordId].owner == msg.sender, "Not owner");

        r.processed = true;
        r.approved = true;

        // Inline grant logic instead of calling grantAccess()
        bytes32 key = _grantKey(r.recordId, r.requester);
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 scope = bytes32("DEFAULT");

        accessGrants[key] = AccessGrant(true, msg.sender, r.requester, r.recordId, validUntil, scope);

        emit AccessGranted(msg.sender, r.requester, r.recordId, validUntil, scope);
        emit AccessRequestApproved(requestId);
    }

    function denyRequest(bytes32 requestId) external onlyExistingUser {
        AccessRequest storage r = accessRequests[requestId];
        require(!r.processed, "Processed");
        require(records[r.recordId].owner == msg.sender, "Not owner");
        r.processed = true;
        r.approved = false;
        emit AccessRequestDenied(requestId);
    }

    // ---------- Logging ----------

    function logAccessEvent(
        address actor,
        bytes32 recordId,
        bool success,
        string calldata action
    ) external onlyExistingUser {
        require(records[recordId].timestamp != 0, "Unknown record");
        AccessEvent memory ev = AccessEvent(actor, recordId, success, block.timestamp, action);
        accessEvents[recordId].push(ev);
        emit AccessEventLogged(actor, recordId, success, block.timestamp, action);
    }

    function getAccessLog(bytes32 recordId) external view returns (AccessEvent[] memory) {
        return accessEvents[recordId];
    }

    // ---------- Emergency / break-glass ----------

    function emergencyAccess(
        bytes32 recordId,
        string calldata justificationHash
    ) external onlyRole(ROLE_RESPONDER) {
        require(records[recordId].timestamp != 0, "Unknown record");
        emit EmergencyAccess(msg.sender, recordId, justificationHash, block.timestamp);
    }
}
