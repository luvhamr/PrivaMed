// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// =============================================================================================================
/// Project:            CSC196D: DApp-based Medical Record Access Control
/// Author:             Ian Andersen (updated with auditor-support for addRecord)
/// =============================================================================================================

contract PrivaMed {
    /// =============================================================================================================
    /// Fields & Structures
    /// =============================================================================================================

    enum Role {
        None,
        Patient,
        Provider,
        Auditor
    }

    struct User {
        Role role;
        bool exists;
    }

    struct Record {
        address owner;
        string cid;
        uint256 createdAt;
        bool exists;
    }

    struct AccessGrant {
        bool active;
        uint256 validUntil;
        bytes32 scope;
    }

    struct AccessRequest {
        address requester;
        bytes32 recordId;
        string reason;
        uint256 createdAt;
        bool fulfilled;
    }

    // Events
    event UserRegistered(address indexed user, Role role);
    event RecordAdded(
        bytes32 indexed recordId,
        address indexed owner,
        string cid
    );
    event AccessGranted(
        bytes32 indexed recordId,
        address indexed grantee,
        uint256 validUntil,
        bytes32 scope
    );
    event AccessRevoked(bytes32 indexed recordId, address indexed grantee);
    event AccessRequested(
        uint256 indexed requestId,
        bytes32 indexed recordId,
        address indexed requester,
        string reason
    );
    event AccessEvent(
        bytes32 indexed recordId,
        address indexed actor,
        bool success,
        string action,
        uint256 timestamp
    );
    event EmergencyAccess(
        bytes32 indexed recordId,
        address indexed actor,
        bytes32 justificationHash,
        uint256 validUntil,
        uint256 timestamp
    );

    /// =============================================================================================================
    /// Storage
    /// =============================================================================================================

    mapping(address => User) public users;
    mapping(bytes32 => Record) public records;
    mapping(bytes32 => mapping(address => AccessGrant)) public grants;

    AccessRequest[] public requests;

    address public admin;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }
    modifier onlyRegistered() {
        require(users[msg.sender].exists, "User not registered");
        _;
    }
    modifier recordExists(bytes32 recordId) {
        require(records[recordId].exists, "Record not found");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// =============================================================================================================
    /// User Management
    /// =============================================================================================================

    function registerUser(address userAddr, Role role) external onlyAdmin {
        require(userAddr != address(0), "zero address");
        require(role != Role.None, "invalid role");

        users[userAddr] = User({role: role, exists: true});
        emit UserRegistered(userAddr, role);
    }

    /// =============================================================================================================
    /// RECORD UPLOAD (FIXED AUTHORIZATION VERSION)
    /// =============================================================================================================
    /// Allows **Patients OR Auditors** to add a record.
    /// Backend auditor (account[0]) can now safely call addRecord() on behalf of a patient.
    /// THIS IS THE ONLY CHANGE YOU NEED.
    /// =============================================================================================================

    function addRecord(
        string calldata cid
    ) external onlyRegistered returns (bytes32) {
        // Allow either the patient-owner OR an auditor to add a record.
        require(
            users[msg.sender].role == Role.Patient ||
                users[msg.sender].role == Role.Auditor,
            "Only patient or auditor may add records"
        );

        bytes32 recordId = keccak256(
            abi.encodePacked(msg.sender, cid, block.timestamp)
        );
        require(!records[recordId].exists, "RecordId already exists");

        records[recordId] = Record({
            owner: msg.sender,
            cid: cid,
            createdAt: block.timestamp,
            exists: true
        });

        emit RecordAdded(recordId, msg.sender, cid);
        return recordId;
    }

    /// =============================================================================================================
    /// Access Control
    /// =============================================================================================================

    function grantAccess(
        bytes32 recordId,
        address grantee,
        uint256 validUntil,
        bytes32 scope
    ) external recordExists(recordId) {
        Record storage r = records[recordId];
        require(msg.sender == r.owner, "Only owner can grant");
        require(
            users[grantee].exists && users[grantee].role == Role.Provider,
            "Grantee must be a registered provider"
        );
        require(grantee != address(0), "Not a valid grantee");

        grants[recordId][grantee] = AccessGrant({
            active: true,
            validUntil: validUntil,
            scope: scope
        });

        emit AccessGranted(recordId, grantee, validUntil, scope);
    }

    function revokeAccess(
        bytes32 recordId,
        address grantee
    ) external recordExists(recordId) {
        Record storage r = records[recordId];
        require(msg.sender == r.owner, "Only owner can revoke");

        AccessGrant storage g = grants[recordId][grantee];
        require(g.active, "Grant not active");

        g.active = false;
        emit AccessRevoked(recordId, grantee);
    }

    /// =============================================================================================================
    /// Access Requests
    /// =============================================================================================================

    function requestAccess(
        bytes32 recordId,
        string calldata reason
    ) external recordExists(recordId) onlyRegistered {
        require(
            users[msg.sender].role == Role.Provider,
            "Only provider may request"
        );

        AccessRequest memory req = AccessRequest({
            requester: msg.sender,
            recordId: recordId,
            reason: reason,
            createdAt: block.timestamp,
            fulfilled: false
        });

        requests.push(req);
        uint256 id = requests.length - 1;
        emit AccessRequested(id, recordId, msg.sender, reason);
    }

    function emergencyAccess(
        bytes32 recordId,
        bytes32 justificationHash,
        uint256 validForSeconds
    ) external recordExists(recordId) onlyRegistered {
        require(
            users[msg.sender].role == Role.Provider,
            "Only provider may use emergency"
        );

        uint256 validUntil = block.timestamp + validForSeconds;

        grants[recordId][msg.sender] = AccessGrant({
            active: true,
            validUntil: validUntil,
            scope: bytes32(0)
        });

        emit EmergencyAccess(
            recordId,
            msg.sender,
            justificationHash,
            validUntil,
            block.timestamp
        );
    }

    /// =============================================================================================================
    /// View / Audit Utilities
    /// =============================================================================================================

    function isAuthorized(
        bytes32 recordId,
        address actor
    ) public view recordExists(recordId) returns (bool) {
        AccessGrant memory g = grants[recordId][actor];

        if (!g.active) return false;
        if (g.validUntil == 0) return true;

        return block.timestamp <= g.validUntil;
    }

    function logAccessEvent(
        bytes32 recordId,
        address actor,
        bool success,
        string calldata action
    ) external recordExists(recordId) {
        emit AccessEvent(recordId, actor, success, action, block.timestamp);
    }

    function getRequestCount() external view returns (uint256) {
        return requests.length;
    }

    function getRequest(
        uint256 requestId
    ) external view returns (AccessRequest memory) {
        require(requestId < requests.length, "invalid id");
        return requests[requestId];
    }

    function getRecordCID(
        bytes32 recordId
    ) external view recordExists(recordId) returns (string memory) {
        return records[recordId].cid;
    }
}
