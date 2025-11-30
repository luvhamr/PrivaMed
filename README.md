# PrivaMed
A privacy-focused decentralized application (DApp) empowering patients to control access to their medical records while ensuring data integrity and secure interoperability. A React client talks to an Express REST API that performs encryption, IPFS storage, and Ethereum interactions via ethers.js.

## 🚀 Project Overview
PrivaMed enables patients to:
* Own and control access to their health data.
* Authorize and revoke provider access at any time.
* Store encrypted medical records off-chain using IPFS.
* Maintain immutable and auditable access logs through Ethereum smart contracts.

_This project is a proof-of-concept operating on a local blockchain test network._

---

## 🧱 Technology Stack
|       Layer        |                     Technology                     |
|--------------------|----------------------------------------------------|
| Smart Contracts    | Solidity, Truffle                                  |
| Blockchain Network | Ganache local testnet                              |
| Backend API        | Node.js, Express, ethers.js                        |
| Frontend           | React + Axios REST client                          |
| Storage            | IPFS + AES-GCM encryption                          |
| Observability      | Provider notifications, advanced chain log console |
| Testing            | Truffle, Mocha/Chai                                |
| Wallet Integration | Ganache RPC (via backend signer)                   |

---

## ⚙️ Setup Instructions

### 1. Install Dependencies
```bash
# clone repository
git clone https://github.com/luvhamr/PrivaMed.git
cd PrivaMed

# install ganache
npm install -g ganache@7.9.1

# install truffle & test framework
npm install truffle --save-dev chai chai-as-promised chai-bn @openzeppelin/test-helpers truffle-assertions
```
### 2. Start Ganache
```bash
ganache -p 8545 --chain.chainId 1337 --chain.networkId 1337 &
```
### 3. Compile and Deploy Smart Contracts
```bash
truffle compile
truffle migrate --reset --network development
```
### 4. Start IPFS Node
```bash
cd backend
npm install ipfs-http-client
ipfs daemon
```
### 5. Run Server & Client Application
```bash
cd backend
npm run dev

cd client/
npm start
```

## 📂 Project Architecture
- Contracts define access control and record indexing and are invoked from the backend via ethers.js.
- Encrypted medical files are stored off-chain in IPFS and keyed per record using AES-GCM.
- Frontend talks to the backend REST API (accounts, records, access grants, logs) and never handles private keys directly.
- Provider notifications and an advanced chain log console keep clinicians informed about newly shared records and recent transactions.
- Patients control permissions through the UI while the backend enforces sharing policies.

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
- Ian Andersen Smart Contract Lead
- Jose Gonzalez Backend Lead
- Juan Frontend Lead

## 
