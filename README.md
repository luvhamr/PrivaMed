# PrivaMed
A privacy-focused decentralized application (DApp) empowering patients to control access to their medical records while ensuring data integrity and secure interoperability.

## 🚀 Project Overview
SovereignCare enables patients to:
* Own and control access to their health data.
* Authorize and revoke provider access at any time.
* Store encrypted medical records off-chain using IPFS.
* Maintain immutable and auditable access logs through Ethereum smart contracts.

_This project is a proof-of-concept operating on a local blockchain test network._

---

## 🧱 Technology Stack
|       Layer        |         Technology        |
|--------------------|---------------------------|
| Smart Contracts    | Solidity, Truffle         |
| Blockchain Network | Ganache local testnet     |
| Frontend           | React + Web3.js           |
| Storage            | IPFS + AES-GCM encryption |
| Testing            | Truffle, Mocha/Chai       |
| Wallet Integration | MetaMask                  |

---

## ⚙️ Setup Instructions

### 1. Install Dependencies
```bash
cd PrivaMed
npm install
cd client && npm install
```
### 2. Start Ganache
```bash
ganache-cli -p 8545 &
```
### 3. Compile and Deploy Smart Contracts
```bash
truffle compile
truffle migrate --network development
```
### 4. Start IPFS Node
```bash
ipfs daemon
```
### 5. Run Client Application
```bash
cd client/
npm start
```

## 📂 Project Architecture
- Contracts define access control and record indexing.
- Encrypted medical files are stored off-chain in IPFS.
- Frontend communicates via Web3.js with smart contracts deployed on Ganache.
- Patients control permissions through the UI.

## 🧪 Testing
To execute smart contract tests:
```bash
truffle test
```
## 🛡️ Security Notes
- No **Protected Health Information (PHI)** is stored directly on-chain.
- Access is enforced via cryptographically secure Ethereum accounts.
- Encryption keys remain in the user's custody.

## 👥 Team Members
- Developer A Smart Contract Lead
- Developer B Blockchain Integration 
- Developer C Frontend Lead
- Developer D Security + Testing & Documentation Engineer

## 
