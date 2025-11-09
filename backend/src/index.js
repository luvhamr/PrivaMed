require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { ethers } = require("ethers");
const ROLE_PATIENT = ethers.keccak256(ethers.toUtf8Bytes("PATIENT"));
const ROLE_AUDITOR = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR")); // we'll use this for the backend/owner
const { generateSymmetricKey, encryptRecord, decryptRecord } = require("./encryption");
const { addJson, getJson } = require("./ipfs");
const path = require("path");
const fs = require("fs");

// blockchain
const WEB3_PROVIDER = process.env.WEB3_PROVIDER || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(WEB3_PROVIDER);

// ---- Contract artifact (Truffle) ----
const artifactPath = path.join(
  __dirname,
  "..",
  "..",
  "build",
  "contracts",
  "AccessControlRegistry.json"
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const ACCESS_REGISTRY_ABI = artifact.abi;

// pick the first network (usually Ganache = 5777)
const artifactNetworks = artifact.networks || {};
const firstNetworkId = Object.keys(artifactNetworks)[0];
const deployedAddress =
  (firstNetworkId && artifactNetworks[firstNetworkId].address) ||
  process.env.ACCESS_REGISTRY_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

const ACCESS_REGISTRY_ADDRESS = deployedAddress;

function getContract(signerOrProvider) {
  if (
    !ACCESS_REGISTRY_ADDRESS ||
    ACCESS_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error("AccessControlRegistry not deployed or address not set");
  }
  return new ethers.Contract(ACCESS_REGISTRY_ADDRESS, ACCESS_REGISTRY_ABI, signerOrProvider);
}

async function getSigner() {
  const accounts = await provider.listAccounts();
  return provider.getSigner(accounts[0].address);
}

async function ensureUserRegistered(contract, address, role) {
  // users is a public mapping, so we can call contract.users(address)
  const user = await contract.users(address);
  if (user.exists) {
    return;
  }
  console.log(`[CHAIN] Registering user ${address} with role ${role}`);
  const tx = await contract.registerUser(address, role, "");
  await tx.wait();
}


const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

const PORT = process.env.PORT || 3333;

// in-memory PoC store
const localRecords = new Map(); // recordId -> { cid, owner, keyHex }

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: WEB3_PROVIDER });
});

app.post("/api/records", async (req, res) => {
  try {
    const { patientAddress, recordId, plaintext } = req.body;
    if (!patientAddress || !recordId || !plaintext) {
      return res.status(400).json({ error: "patientAddress, recordId, plaintext required" });
    }

    const key = generateSymmetricKey();
    const enc = encryptRecord(plaintext, key);
    const cid = await addJson(enc);

    localRecords.set(recordId, {
      cid,
      owner: patientAddress,
      keyHex: key.toString("hex")
    });

    const recordIdHash = ethers.keccak256(ethers.toUtf8Bytes(recordId));

    const signer = await getSigner();
    const contract = getContract(signer);

    // auto-register backend/owner and patient
    const ownerAddress = await contract.owner();
    await ensureUserRegistered(contract, ownerAddress, ROLE_AUDITOR);
    await ensureUserRegistered(contract, patientAddress, ROLE_PATIENT);

    const tx = await contract.addRecord(recordIdHash, cid, patientAddress);
    await tx.wait();

    res.json({ recordId, cid, recordIdHash });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to store record" });
  }
});

app.get("/api/records/:recordId", async (req, res) => {
  try {
    const { recordId } = req.params;
    const meta = localRecords.get(recordId);
    if (!meta) {
      return res.status(404).json({ error: "record not found" });
    }

    const enc = await getJson(meta.cid);
    const keyBuf = Buffer.from(meta.keyHex, "hex");
    const plaintext = decryptRecord(enc, keyBuf);

    // later: verify hasAccess on chain

    res.json({ recordId, plaintext });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to fetch record" });
  }
});

app.listen(PORT, () => {
  console.log(`PrivaMed backend listening on port ${PORT}`);
});
