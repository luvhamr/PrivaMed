# PrivaMed: Decentralized Medical Record Access and Audit Platform
[PrivaMed DApp](https://github.com/luvhamr/PrivaMed) is privacy-focused decentralized application (DApp) empowering patients to control access to their medical records while ensuring data integrity and secure interoperability.

---
# 1. Introduction / Motivation

## 1.1 Centralized platform to transform

Target platform for transformation: **OpenEMR** — an established, open-source electronic medical records platform.

* Website: [https://www.open-emr.org](https://www.open-emr.org)

Rationale for selecting OpenEMR: widely used open-source codebase that exposes typical centralized EHR workflows (patient records, clinical notes, role-based access). OpenEMR provides realistic data models and APIs for a PoC without contractual/licensing barriers.

## 1.2 Why convert to a blockchain-based solution

Transforming a centralized EHR into a DApp aligns with several technical and governance objectives discussed in class regarding Ethereum as a general-purpose platform:

* **Immutable audit trail:** Smart contracts provide an auditable, tamper-evident log of consent and access events. This supports forensicability and patient/clinician trust.
* **Decentralized authorization semantics:** Rather than a single organization controlling access policies, access can be expressed as verifiable on-chain consent records and role assertions.
* **Programmable policy enforcement:** Smart contracts encode consent logic and access revocation deterministically. Complex workflows (time-limited access, emergency “break-glass”) become verifiable state transitions.
* **Interoperability primitives:** On-chain metadata and pointers can act as a canonical attestation for data locations and versions across institutions.
* **User-centric ownership model:** Keys and on-chain state can shift authority toward data subjects (patients) or delegated clinicians while still enabling institutional oversight.
* **Proof-of-concept feasibility on Ethereum testnets:** Rapid prototyping with Solidity and local testnets (Hardhat/Ganache) allows demonstration without production migration risk.

Caveats: PHI must not be stored on a public ledger; the PoC uses hybrid storage (encrypted off-chain PHI + on-chain metadata and logs).

---
# 2. Roles and Responsibilities

Four developers are assigned explicit roles with primary responsibilities and measurable deliverables.

> Team Members (placeholders — replace names as applicable)

1. **Lead Blockchain Developer — “Dev01”**
   **Primary responsibilities**

   * Design and implement Solidity smart contracts (consent registry, access logging, role management, emergency access).
   * Deploy contracts to local testnet and write deployment/migration scripts.
   * Write and run automated contract tests (unit and integration) using Hardhat/Truffle.
     **Deliverables**
   * Contract source, tests, gas profiling artifacts, deployment scripts, ABI files.

2. **Backend Developer — “Dev02”**
   **Primary responsibilities**

   * Implement Node.js/TypeScript backend that interfaces with smart contracts (ethers.js/web3), performs key management, and mediates off-chain encrypted storage.
   * Integrate local IPFS or encrypted filesystem for PHI, implement encryption/decryption services (AES-GCM or AES-256).
   * Implement server-side verification of access rights and audit event submission.
     **Deliverables**
   * Backend API, storage integration, key-management module, test data loader, unit/integration tests for backend–contract interactions.

3. **Full-Stack / Frontend Developer — “Dev03”**
   **Primary responsibilities**

   * Build React UI to simulate clinician/responder workflows: login simulation, request/grant access flows, record viewer, consent manager, audit log viewer.
   * Integrate wallet simulation (MetaMask/local signer) and real contract calls via ethers.js.
   * Implement UX for break-glass emergency flow with justification capture.
     **Deliverables**
   * React app, UI component library, e2e demo scenarios, documentation on running locally.

4. **DevOps & QA Engineer — “Dev04”**
   **Primary responsibilities**

   * Configure and maintain local development environment (Ganache or Hardhat node, local IPFS node).
   * Establish CI (GitHub Actions) for tests and linting, manage deployments for demos.
   * Perform QA and security review (static analysis of contracts, crypto library review), coordinate bug triage.
     **Deliverables**
   * Local environment scripts, CI pipelines, test matrices, security review checklist, demo runbook.

All team members will provide daily short updates and contribute to peer code reviews. Responsibility boundaries are primary but not exclusive — collaboration expected.

---
# 3. System Design

## 3.1 Actors in the DApp

* **Clinician (Physician):** requests and reads patient records when authorized.
* **Emergency Responder:** may trigger emergency (break-glass) access with logging and post-hoc review.
* **Patient (Data Subject):** registers consent policies and keys; may grant/revoke access. For the PoC, patient actions can be simulated or exercised by developers.
* **Audit / Compliance Officer:** reads immutable logs and generates compliance reports.
* **System Admin (local):** deploys contracts, manages test identities (only in PoC).
* **Off-chain Storage Node:** IPFS/local encrypted storage hosting PHI ciphertext.

## 3.2 Smart contract functions (Solidity) — planned implementation

Contracts are intentionally small, audited, and purpose-specific. Suggested contract layout:

**Contracts**

* `AccessControlRegistry` (main entrypoint)
* `RoleManager` (optional, or integrated)
* `EmergencyAccessController` (break-glass policy)

**Data structures**

```solidity
struct User {
  address wallet;
  bytes32 role;          // "PATIENT","PHYSICIAN","RESPONDER","AUDITOR"
  string publicKeyPEM;   // optional: public key for asymmetric encryption
  bool exists;
}

struct RecordPointer {
  bytes32 recordId;      // unique record id (hash)
  string ipfsCid;        // off-chain encrypted file pointer
  bytes32 owner;         // patient id
  uint256 timestamp;
}
```

**Core functions**

* `registerUser(address wallet, bytes32 role, string publicKey)`
  Registers test users and associates role metadata.

* `addRecord(bytes32 recordId, string ipfsCid, address patient)`
  Adds a metadata pointer (called by backend on behalf of the patient or system). Emits `RecordAdded`.

* `grantAccess(address grantee, bytes32 recordId, uint256 validUntil, bytes32 scope)`
  Patient (or authorized delegate) grants access to an address for a record or scope. Emits `AccessGranted`.

* `revokeAccess(address grantee, bytes32 recordId)`
  Revoke previously granted access. Emits `AccessRevoked`.

* `requestAccess(address requester, bytes32 recordId, string reason)`
  Records an access request; emits `AccessRequested`. Used by clinicians to signal intent.

* `logAccessEvent(address actor, bytes32 recordId, bool success, string action)`
  Called by backend after access; stores an immutable access event for audits. Emits `AccessEvent`.

* `approveRequest(bytes32 requestId)` / `denyRequest(bytes32 requestId)`
  For patient or delegate to process requests.

* `emergencyAccess(address actor, bytes32 recordId, string justificationHash)`
  Break-glass flow: grants temporary access and logs justification. Emits `EmergencyAccess`.

* `getAccessLog(bytes32 recordId) view returns (AccessEvent[])`
  Read audit log entries for compliance.

**Events**

* `event AccessGranted(address indexed granter, address indexed grantee, bytes32 indexed recordId, uint256 validUntil);`
* `event AccessRevoked(address indexed granter, address indexed grantee, bytes32 indexed recordId);`
* `event AccessEvent(address indexed actor, bytes32 recordId, bool success, uint256 timestamp, string action);`
* `event EmergencyAccess(address indexed actor, bytes32 recordId, string justificationHash, uint256 timestamp);`

**Access control patterns**
* Use `onlyOwner`/`onlyRole` modifiers for administrative functions. Keep contract logic minimal: enforce role checks and record state; do not attempt to encrypt or transmit PHI on-chain.

**Security considerations**
* Small contracts with clear boundaries reduce attack surface.
* All cryptographic operations (encrypt/decrypt) occur off-chain in backend or client. Contracts only store hashes/ids and logs.
* Include reentrancy guard (OpenZeppelin patterns), input validation, and constrained storage sizes.

## 3.3 User interaction flows (diagrams)

### 3.3.1 Normal access flow (clinician reads record)

```
Clinician UI  --->  Backend API  --->  Smart Contract                                                    (requestAccess)
    |                 |                     |
    |------------- request recorded --------|
    |                 |                     |
Clinician UI <--- notify status  <--- Patient approves (optional)
    |                 |                     |
Clinician UI ---> Backend: fetchAccessRight
    |                 |                     |
Backend verifies on-chain grant => checks validUntil
    |                 |                     |
Backend retrieves encrypted PHI from IPFS/local storage
Backend decrypts using symmetric key (which it obtains by decrypting stored key using patient's public key or via key-manager)
Backend returns plaintext (or session token) to Clinician UI
Backend calls contract.logAccessEvent(...)
```

### 3.3.2 Emergency (break-glass) flow

```
Responder UI ---> Backend ---> Smart Contract
   |                 |         .emergencyAccess(justificationHash)
   |                 |                           |
   |-- immediate temporary grant & log --------->|
   |                 |                           |
Backend pulls encrypted PHI and returns to Responder UI after decryption
Post-hoc: Audit officer retrieves emergency events and reviews justifications
```

### 3.3.3 Component diagram (ASCII)

```
+----------------+        +----------------+      +--------------+
|  Frontend UI   | <----> |  Backend API   | <--> |    Smart     |
| (React + MetaM)|        | (Node/TS, KMS) |      |  Contracts   |
|                |        |                |      |  (Ganache)   |
+----------------+        +----------------+      +--------------+
       |                        |
       |                        v
       |                  +----------------+
       |                  | Off-Chain Store|
       |                  |     (IPFS /    |
       |                  |  Encrypted FS) |
       |                  +----------------+
       v
 User (Clinician/Responder/Patient)
```

---
# 4. System / UI Implementation Design
## 4.1 Environment setup and tooling
**Recommended stack (PoC)**
- Node.js LTS (>= 18) + npm/Yarn
- **Truffle Suite** for contract compilation, automated testing, and migrations
- **Ganache** for local Ethereum blockchain with deterministic accounts and GUI-based state inspection
- **Solidity** (0.8.x recommended) with OpenZeppelin libraries for secure access-control primitives
- **Web3.js** for blockchain interaction in backend and frontend
- **React** (Vite or Create React App) for the user interface
- **IPFS** (local go-ipfs node) for off-chain encrypted health record storage
- **AES-GCM encryption** for Protected Health Information (PHI) confidentiality (via Node.js crypto API or audited libraries)
- **Local encryption keystore** for ephemeral key management (optionally upgraded to secure vault architecture later)
- **Testing:** Truffle test framework with Mocha/Chai expectations, Ganache as test execution backend, Slither for static analysis
- **CI:** GitHub Actions for smart contract and integration test execution

---

**Setup steps (Developer Checklist)**
1. Clone the repository; install dependencies:
```bash
  npm install
```

2. Launch local Ganache blockchain instance (GUI or CLI):
 ```bash
 ganache-cli -p 8545
 ```

3. Compile Solidity contracts with Truffle:
```bash
truffle compile
```

4. Deploy contracts to Ganache using Truffle migrations:
```bash
truffle migrate --network development
```

5. Start local IPFS node:
```bash
ipfs daemon
```

6. Launch backend server:
```bash
npm run start:backend
 ```

7. Launch frontend UI:
  ```bash
   npm run start:frontend
   ```

8. Configure MetaMask to point to Ganache’s RPC endpoint (default: [http://127.0.0.1:8545](http://127.0.0.1:8545/)), import a provided Ganache account, and verify connection.
## 4.2 Component communication
* **Frontend ↔ Backend:** REST/GraphQL over HTTPS (or HTTP for local PoC). The frontend uses MetaMask or a local signer to sign transactions for contract interactions where appropriate. For privacy, UI does not display raw private keys.

* **Backend ↔ Smart Contract:** `ethers.js` provider connected to local Hardhat/Ganache node. Backend will sign only administrative operations (deploy, log events on behalf of verified servers). For user-driven operations requiring cryptographic proof, the frontend may send signed transactions directly.

* **Backend ↔ Off-chain Storage:** Backend interfaces with IPFS API (HTTP API) or reads/writes encrypted files to local storage. When adding a record, backend encrypts PHI, stores ciphertext in IPFS, gets CID, and calls `addRecord` with CID metadata.

* **Key flow and encryption**
  * PHI encryption: symmetric key (AES-256) per record.
  * Symmetric key storage: symmetric key encrypted with the patient’s public key (asymmetric) and stored alongside record metadata off-chain or in the backend store. When clinician is granted access, patient (or delegated key manager) provides the symmetric key encrypted for clinician, or backend performs Key-Wrapping on behalf of patient in PoC.
  * Contract stores only the CID and a hash of the ciphertext/metadata (for integrity verification).

* **Wallets and session flow**
  * MetaMask configured to local chain for transactions requiring an on-chain action (grant/revoke/request).
  * For operations requiring higher assurance, the backend verifies the origin address via signed messages.

---
# 5. UI Implementation

## 5.1 Components to demonstrate
Minimal, focused UI components to show core functionality:

1. **Login / Role Selector Panel**
   * Select / import one of the test wallets (patient, physician, responder, auditor). MetaMask or local signer simulation.

2. **Patient Dashboard (admin view for PoC)**
   * Upload new record (file input) → encrypts and stores to IPFS → calls `addRecord`.
   * List of patient records (metadata view): recordId, date, summary, access controls.

3. **Consent & Access Management Panel**
   * Grant Access modal: select grantee address/role, set validity period and scope (labs, notes). Calls `grantAccess`.
   * Revoke Access button.

4. **Clinician / Responder Dashboard**
   * Search patient by ID; view metadata; request access button.
   * If access exists: view record viewer (renders decrypted plaintext or JSON).
   * **Emergency Access**: prominent “Break-Glass” button that forces `emergencyAccess` with a required justification text entry; confirmation signature required.

5. **Record Viewer**
   * Renders allowed fields (lab results, allergies, notes). Shows provenance metadata (who added, timestamp). Shows audit badge.

6. **Audit Log Viewer (Auditor role)**
   * Query events for a patient/record: list of `AccessEvent`, `AccessGranted`, `EmergencyAccess`. Allow export to CSV.

7. **Contract Status / Gas Profiler** (developer visualization)
   * Show contract addresses, transaction hashes, and local gas usage per operation (Hardhat gas reporter output).

8. **Key Management Panel (PoC simplified)**
   * Show how symmetric keys are wrapped/unwrapped and assigned to grantees (represents KMS flows).

UX constraints: keep UI minimal and clearly label that all data is test data and not production PHI.

---
# 6. Project Plan
## 6.1 Week-by-week schedule (4 weeks)
All tasks assume parallel work, daily standups (15 minutes), and twice-daily CI checks.
### Week 0 (Pre-work) — (Optional quick setup, can be compressed into Week 1)
* Repo skeleton created, common code templates, environment docs.
* Team on-boarding and assignment confirmation.

### Week 1 — Foundation & Contracts
**Goals:** finalize architecture, baseline environment, contract skeleton.

* **Lead Blockchain (Dev01)**
  * Finalize contract ABIs and data model.
  * Implement contract skeletons: `AccessControlRegistry.sol`, events, basic unit tests.
  * Deliver deployment scripts.

* **Backend (Dev02)**
  * Implement project skeleton (Node/TypeScript), set up ethers provider and simple endpoint to call contracts.
  * Stand up local IPFS or encrypted FS and minimal key-manager stub.

* **Frontend (Dev03)**
  * Scaffold React app, auth/role chooser UI, and contract integration stubs.

* **DevOps/QA (Dev04)**
  * Configure Hardhat network; add GitHub Actions for lint and contract tests.
  * Set up Slither static analysis and basic test harness.

**Deliverables Week 1**
* Contract code with unit tests passing on local Hardhat node.
* Working local dev environment docs and Dev03ple runbook.

### Week 2 — Access Workflows & Off-chain Storage
**Goals:** implement grant/revoke/request flows, store/retrieve encrypted PHI.

* **Dev01**
  * Complete grant/revoke, requestAccess, emergencyAccess functions and comprehensive unit tests.
  * Add gas measurement tests (Hardhat gas reporter).

* **Dev02**
  * Implement backend integration: encrypt and store record to IPFS, return CID, call `addRecord`.
  * Implement key wrapping/unwrapping flows (PoC KMS).
  * Implement `logAccessEvent` call after successful retrieval.

* **Dev03**
  * Implement Patient dashboard (add record), Consent UI (grant/revoke).
  
* **Dev04**
  * Run contract security checks, integration testing between backend and contracts, stabilize CI.

**Deliverables Week 2**
* End-to-end flow: add record → grant access → clinician reads record (decrypted) with on-chain logs.

### Week 3 — UI polish and edge flows
**Goals:** implement emergency access flow, audit views, UX polish, user acceptance.

* **Dev01**
  * Harden emergencyAccess contract logic and add time-limited tokens for emergency access.
  * Peer review contracts.

* **Dev02**
  * Implement emergency decryption flow and post-hoc log linking (attach justificationHash).
  * Implement backend APIs for auditor queries.

* **Dev03**
  * Implement Clinician dashboard, emergency button, and record viewer UI.
  * Add audit log viewer and export functionality.

* **Dev04**
  * Complete QA test matrix, record bug fixes, run e2e tests, prepare demo script and CI.

**Deliverables Week 3**
* UI flows implemented: normal access, request/approval, emergency access, audit retrieval.

### Week 4 — Testing, Security Review, Demo & Documentation
**Goals:** finalize tests, presentable demo, documentation and retrospective.

* **All**
  * Final integration tests and performance observations.
  * Security review summary (contract analyzer results, crypto library check).
  * Prepare final demo: scripted scenario where physician and responder access a patient record, with audit extraction.
  * Produce documentation: README, deployment steps, API docs, and a short slide deck for stakeholders.

**Deliverables Week 4**
* Working PoC with runbook, codebase, demo script, and final retrospective + roadmap.

**Assignment of responsibilities per week (summary table)**

| Week | Dev01 (Blockchain)                   | Dev02 (Backend)                   | Dev03 (Frontend)             | Dev04 (DevOps/QA)                |
| ---- | ----------------------------------- | --------------------------------- | -------------------------- | --------------------------------- |
| 1    | Contract skeleton, deploy scripts   | Backend skeleton, IPFS stub       | UI skeleton                | Hardhat/GitHub Actions            |
| 2    | Complete contract logic & gas tests | Encryption, addRecord flow        | Patient/Consent UI         | Integration tests                 |
| 3    | Emergency access & review           | Emergency decryption, auditor API | Clinician UI, audit viewer | e2e tests, demo prep              |
| 4    | Final fixes, security review        | Final backend polish              | UI polish, demo            | Demo runbook, docs, retrospective |

---
# 7. Performance — Observations & Analysis Plan

## 7.1 Metrics and analyses planned

1.  **Feasibility / Functional correctness**
   * Confirm that on-chain consent and access logs correctly reflect user actions and that off-chain PHI remains encrypted and retrievable only when access controls permit.

2. **Transaction latency (local)**
   * Measure average elapsed time between transaction submission and confirmation on local Hardhat/Ganache node for key operations: `grantAccess`, `revokeAccess`, `emergencyAccess`, `logAccessEvent`.
   * Collect distribution (mean, median, 95th percentile) over N runs (N≥50).

3. **Gas usage and cost profiling**
   * Use Hardhat gas reporter to obtain gas units consumed by each contract function.
   * Do not publish mainnet Ether prices in the PoC; instead provide method for extrapolating cost: `gasUnits * gasPrice` where gasPrice is the current network gas price at evaluation time. Provide example calculation mechanism in docs.

4. **End-to-end latency for read flow**
   * Time from clinician UI click → on-chain verification → off-chain retrieval → decryption → UI render. Measure per record size class (small: 1 KB, medium: 100 KB, large: 1 MB).

5. **Encryption/decryption throughput**
   * Measure symmetric encryption/decryption time per file size. Ensure decryption does not exceed acceptable clinical latency (e.g., <1s for small/medium records in PoC).

6. **Storage and retrieval performance**
   * IPFS CID add/get latency measured locally. For PoC, measure baseline times and note differences with centralized S3 alternatives.

7. **Scalability projections (back-of-envelope)**
   * Extrapolate gas and latency to a permissioned chain or a public testnet. Document assumptions and variables: average gas price, transaction throughput, block time. Provide an example calculation rather than an absolute claim.

8. **Security and correctness tests**
   * Static analysis output (Slither) and unit test coverage percentage.
   * Attack scenarios to validate: unauthorized access, replay attacks, emergency access misuse, key compromise within PoC constraints.

9. **Usability observations**
   * Time to complete basic workflows by a test user (setup, grant, request, retrieval). Collect qualitative notes on UX friction.

## Measurement tools & approach
* **Hardhat gas reporter:** for gas units per function.
* **Benchmark harness (Node script):** submit repeated transactions and measure confirmation latency.
* **Backend microbenchmarks:** measure encrypt/decrypt times using Node.js `crypto` timers.
* **IPFS bench scripts:** upload & download times across record sizes.
* **Logging and analysis:** collect results into CSV and plot simple latency histograms (for internal analysis). Use results to produce a short performance section in the final report.

## Interpreting results
* If gas per common operation is modest (e.g., tens of thousands gas units) the on-chain metadata approach is viable; if gas is high, consider moving to a permissioned ledger with lower transaction costs.
* If decryption or IPFS retrieval introduces clinical delays, optimize by prefetching, caching encrypted blobs at trusted points, or reducing record size transferred to UI (render summaries with an option to fetch fuller content).

---
# Appendix — Threat Model & Minimal Security Controls (Summary)

**Threats considered**
* Unauthorized on-chain writes (mitigated by role checks).
* Data exposure via on-chain storage (mitigated by storing only CIDs and hashes; no PHI on chain).
* Key compromise (mitigate with KMS and wrap keys asymmetrically).
* Emergency access abuse (mitigate with mandatory justification logged on-chain and post-hoc auditing).
* Replay or injection (mitigate via signed messages and replay nonces for off-chain API operations).

**Minimal controls for PoC**
* Use OpenZeppelin ACL patterns.
* Use vetted crypto libraries and AES-GCM for encryption.
* Perform static analysis and at least one manual review of contracts.
* Limit testnet accounts and run all work locally behind a firewall.

---
# Final notes and next steps

* This expanded plan is sufficient to begin immediate implementation. The repository should contain templates for contract code, backend stubs, and frontend scaffold to accelerate Week 1 progress.
* If desired, the next deliverable can be a short technical appendix with: (a) Solidity contract interface skeleton, (b) backend API contract call examples using `ethers.js`, and (c) a runnable `docker-compose.yml` that launches Hardhat/Ganache, IPFS, backend, and frontend for one-command demos. Prepare any of these artefacts on request.

If the team is ready, proceed with producing the repository skeleton and Week-1 sprint ticket list so work can begin immediately.

