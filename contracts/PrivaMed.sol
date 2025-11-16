/// =============================================================================================================
/// Project:            CSC196D: DApp-based Medical Record Access Control
/// Date-Created:       13 November 2025
/// Author(s):          Ian Andersen
/// Last-Modified:      15 November 2025
/// =============================================================================================================

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title  PrivaMed Smart Contract - consent-based access management for off-chain medical records
/// @notice Stores patient record metadata (CIDs), grants/revokes access, logs access attempts, support for emergency access
/// @dev    PHI & PII is never stored here.

contract PrivaMed{    
/// =============================================================================================================
/// Fields & Structures
/// =============================================================================================================
    
    // Roles 
    enum Role { None, Patient, Provider, Auditor } 

    struct User { Role role;
        bool exitst;
    }

    //  Create new record - store an owner w/ patient address, IPFS CID, and timestamp
    struct Record {
       address owner;           // patient address
       string cid;              // IPFS CID (encrypted)
       uint256 createdAt;
       bool exists;     
    }
        
    // Grant access - store grantee address, valid access period, active request flag;
    //  only registered patients and can add records or grant/revoke access to their records
    struct AccessGranted {
        bool active;            // true, if grant flag is currently active
        uint256 validUntil;     // timestamp for valid access period (0 == indefinite access)
        bytes32 scope;          // scope ID (ex: "LABS", "NOTES", "PRESCRIPTIONS")
    }

    // Request access - store provider/physician-request metadata for async approval
    // Log Access Events - backend function for tracking record access events: retrieval and decryption
    struct AccessRequest{
        address requester;      // address of provider or emergency access requester
        bytes32 recordID;       // requester's ID
        string reason;          // plaintext: reason for record access
        uint255 createdAt;
        bool fulfilled;
    }

    // Events:RecordAccess, AccessGranted, AccessRevoked, AccessRequested, AccessEvent, EmergencyAccess
    // (emergency access allows temporary recorded access + justification hash and logging for audits).
    event UserRegistered(address indexed user, Role role);
    event RecordAdded(bytes32 indexed recordId, address indexed owner, string cid);
    event AccessGranted(bytes32 indexed recordId, address indexed grantee, uint256 validUntil, bytes32 scope);
    event AccessRevoked(bytes32 indexed recordId, address indexed grantee);
    event AccessRequested(uint256 indexed requestId, bytes32 indexed recordId, address indexed requester, string reason);
    event AccessEvent(bytes32 indexed recordId, address indexed actor, bool success, string action, uint256 timestamp);
    event EmergencyAccess(bytes32 indexed recordId, address indexed actor, bytes32 justificationHash, uint256 validUntil, uint256 timestamp);

/// =============================================================================================================
/// Smart Contract Mapping & Constructor: data mapping, contract owner/users, role requirements
/// =============================================================================================================
    
    // Mapping user to record (establish record ownership)
    mapping(address => User) public users;
    mapping(bytes32 => Record) public records;  //recordId -> Record

    // Mapping record access requests: recordId -> grantee -> AccessGrant
    mapping(bytes32 => mapping(adress => AccessGrant)) public grants;

    // Store access requests
    AccessRequest[] public requests;

    // Contract owner (admin)
    address public admin;

    // Role requirements
    modifier onlyAdmin() {require(msg.sender == admin, "Admin only");_;}
    modifier onlyRegistered() {require(users[msg.sender].exists, "User not registered");_;}
    modifier onlyPatient() {require(users[patient].exists && users[patient].role, "Not a patient");_;}
    modifier recordExists() {require(records[recordId].exists, "Record not found");_;}

    // Contract constructor
    constructor() {admin = msg.sender;}


/// ==============================================================================================================
/// Contract Functions
/// ==============================================================================================================
 
    // -----------------------------------------------------------------------------------------------------------
    // User administration - register a user (patient, provider, auditor)
    // -----------------------------------------------------------------------------------------------------------
    function registerUser(address userAddr, Role role) external onlyAdmin {
        require(userAddr != address(0), "zero address");
        require(role != Role.None, "invalid role");
        users[userAddr] = User({ role: role, exists: true });
        emit UserRegistered(userAddr, role);
    }
    
    // -----------------------------------------------------------------------------------------------------------
    // Patient Record Lifecycle - add a new record pointer (CID) for patient
    // -----------------------------------------------------------------------------------------------------------
    function addRecord(string calldata cid) external onlyRegistered returns (bytes32) {
        require(users[msg.sender].role == Role.Patient, "Only patient may add records");

        bytes32 recordId = keccak256(abi.encodePacked(msg.sender, cid, block.timestamp));
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

    
    // -----------------------------------------------------------------------------------------------------------
    // Access Control - grant/revoke access to a record for a given grantee address 
    // -----------------------------------------------------------------------------------------------------------
    
    // Grant Access
    function grantAccess(bytes32 recordId, address grantee, uint256 validUntil, bytes32 scope)
        external
        recordExists(recordId)
    {
        Record storage r = records[recordId];
        require(msg.sender == r.owner, "Only owner can grant");
        require(users[grantee].exists && users[grantee].role == Role.Provider, "Grantee must be a registered provider");
        require(grantee != address(0), "Not a valid grantee");

        grants[recordId][grantee] = AccessGrant({
            active: true,
            validUntil: validUntil,
            scope: scope
        });

        emit AccessGranted(recordId, grantee, validUntil, scope);
    }

    // Revoke Access
    function revokeAccess(bytes32 recordId, address grantee) external recordExists(recordId) {
        Record storage r = records[recordId];
        require(msg.sender == r.owner, "Only owner can revoke");
        AccessGrant storage g = grants[recordId][grantee];
        require(g.active, "Grant not active");

        g.active = false;
        emit AccessRevoked(recordId, grantee);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Access Requests & Emergency Requests:
    //      - Provider requests access for a record with a justification
    //      - Emergency access granted temporarily with justification hash; access is logged for auditing.
    // -----------------------------------------------------------------------------------------------------------

    // Access request
    function requestAccess(bytes32 recordId, string calldata reason) external recordExists(recordId) onlyRegistered {
        require(users[msg.sender].role == Role.Provider, "Only provider may request");
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

    // Emergency access
    function emergencyAccess(bytes32 recordId, bytes32 justificationHash, uint256 validForSeconds)
        external
        recordExists(recordId)
        onlyRegistered
    {
        require(users[msg.sender].role == Role.Provider, "Only provider may use emergency");
        // Temporarily grant access
        uint256 validUntil = block.timestamp + validForSeconds;
        grants[recordId][msg.sender] = AccessGrant({
            active: true,
            validUntil: validUntil,
            scope: bytes32(0)
        });

        emit EmergencyAccess(recordId, msg.sender, justificationHash, validUntil, block.timestamp);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Access verification & logging:
    //      - Check if user is authorized to access requested record
    //      - Log access events (success/failure) for auditing
    // -----------------------------------------------------------------------------------------------------------

    // Caller verification
    function isAuthorized(bytes32 recordId, address actor) public view recordExists(recordId) returns (bool) {
        AccessGrant memory g = grants[recordId][actor];
        if (!g.active) {
            return false;
        }
        if (g.validUntil == 0) {
            return true; // no expiry
        }
        return block.timestamp <= g.validUntil;
    }

    // Access event logging
    function logAccessEvent(bytes32 recordId, address actor, bool success, string calldata action) external recordExists(recordId) {
        emit AccessEvent(recordId, actor, success, action, block.timestamp);
    }
    
    // -----------------------------------------------------------------------------------------------------------
    // View utilities - pending requests, request-by-id, return record CID
    // -----------------------------------------------------------------------------------------------------------
    
    // Get the number of pending requests
    function getRequestCount() external view returns (uint256) { return requests.length; }
    
    // Fetch requests by id 
    function getRequest(uint256 requestId) external view returns (AccessRequest memory) {
        require(requestId < request.length, "invalid id");
        return requests[requestId];
    }

    // Get record CID (allows client to fetch record off-chain)
    function getRecordCID(bytes32 recordId) external view recordExists(recordId) returns (string memory) {
        return records[recordId].cid;
    }
}
