require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { ethers } = require("ethers");
const {
  generateSymmetricKey,
  encryptRecord,
  decryptRecord
} = require("./encryption");
const { addJson, getJson } = require("./ipfs");
const path = require("path");
const fs = require("fs");

// -----------------------------------------------------------------------------
// Blockchain setup
// -----------------------------------------------------------------------------
const WEB3_PROVIDER = process.env.WEB3_PROVIDER || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(WEB3_PROVIDER);

// Solidity enum: enum Role { None, Patient, Provider, Auditor }
const ROLE_PATIENT = 1;
const ROLE_PROVIDER = 2;
const ROLE_AUDITOR = 3; // backend/admin

// ---- Contract artifact (Truffle) ----
const artifactPath = path.join(
  __dirname,
  "..",
  "..",
  "build",
  "contracts",
  "PrivaMed.json"
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const PRIVAMED_ABI = artifact.abi;

// We'll lazily resolve the correct contract address for the current network.
let PRIVAMED_ADDRESS_CACHE = process.env.PRIVAMED_ADDRESS || null;

// Resolve PrivaMed address based on the *actual* provider network ID
async function getPrivaMedAddress() {
  // If an explicit env var is set, prefer that
  if (PRIVAMED_ADDRESS_CACHE) {
    return PRIVAMED_ADDRESS_CACHE;
  }

  const network = await provider.getNetwork();
  const chainIdNum = Number(network.chainId);
  const networks = artifact.networks || {};

  // Truffle networks keys are usually strings, sometimes numbers depending on tooling
  const net =
    networks[chainIdNum] ||
    networks[String(chainIdNum)] ||
    networks[network.chainId];

  if (!net || !net.address) {
    throw new Error(
      `PrivaMed not deployed on network ${chainIdNum}. Did you run "truffle migrate --reset --network development"?`
    );
  }

  PRIVAMED_ADDRESS_CACHE = net.address;
  console.log("Resolved PrivaMed contract address:", PRIVAMED_ADDRESS_CACHE);
  return PRIVAMED_ADDRESS_CACHE;
}

async function getContract(signerOrProvider) {
  const addr = await getPrivaMedAddress();
  return new ethers.Contract(addr, PRIVAMED_ABI, signerOrProvider);
}

// Robustly get a signer for the first Ganache account, whether listAccounts()
// returns plain strings or objects with an .address field.
async function getSigner() {
  const accounts = await provider.listAccounts();
  if (!accounts.length) {
    throw new Error("No accounts available from provider");
  }

  const first = accounts[0];
  let address;

  if (typeof first === "string") {
    address = first;
  } else if (first && typeof first.address === "string") {
    // In case some provider returns signer-like objects
    address = first.address;
  } else {
    throw new Error(
      `Unsupported account shape from provider: ${JSON.stringify(first)}`
    );
  }

  return provider.getSigner(address);
}

// Ensure the given address is registered on-chain with the given role
async function ensureUserRegistered(contract, address, role) {
  try {
    const user = await contract.users(address); // { role, exists }
    if (user && user.exists) {
      return;
    }
    console.log(`[CHAIN] Registering user ${address} with role ${role}`);
    const tx = await contract.registerUser(address, role);
    await tx.wait();
  } catch (err) {
    console.error(
      `[CHAIN] Failed to ensure user registered for ${address}:`,
      err
    );
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Express app
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

const PORT = process.env.PORT || 3333;

// In-memory PoC store: recordId (string) -> { cid, owner, keyHex, recordIdHash }
const localRecords = new Map();

app.get("/health", async (_req, res) => {
  try {
    let addr = null;
    try {
      addr = await getPrivaMedAddress();
    } catch {
      addr = null;
    }
    res.json({ ok: true, network: WEB3_PROVIDER, contract: addr });
  } catch (e) {
    res.status(500).json({ ok: false, error: "health check failed" });
  }
});

// List Ganache accounts so the frontend can treat 0 as patient and others as providers
app.get("/api/accounts", async (_req, res) => {
  try {
    const raw = await provider.listAccounts();

    const accounts = (raw || []).map((a) =>
      typeof a === "string" ? a : a.address
    );

    res.json({ accounts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to list accounts" });
  }
});

// -----------------------------------------------------------------------------
// Store a record (note + optional file) off-chain and TRY to register on-chain
// -----------------------------------------------------------------------------
app.post("/api/records", async (req, res) => {
  try {
    const { patientAddress, recordId, plaintext, fileMeta } = req.body;

    const hasPlaintext =
      typeof plaintext === "string" && plaintext.trim().length > 0;
    const hasFile =
      fileMeta &&
      typeof fileMeta.base64 === "string" &&
      fileMeta.base64.length > 0 &&
      typeof fileMeta.name === "string";

    if (!patientAddress || !recordId || (!hasPlaintext && !hasFile)) {
      return res.status(400).json({
        error:
          "patientAddress and recordId required, plus either plaintext or fileMeta.base64"
      });
    }

    // 1) Build an envelope that can hold either a note or a file
    let contentEnvelope;
    if (hasFile) {
      contentEnvelope = {
        kind: "file",
        fileName: fileMeta.name,
        mimeType: fileMeta.type || "application/octet-stream",
        size: fileMeta.size || null,
        base64: fileMeta.base64,
        note: hasPlaintext ? plaintext : null
      };
    } else {
      contentEnvelope = {
        kind: "note",
        text: plaintext
      };
    }

    // 2) Encrypt the envelope (JSON string)
    const key = generateSymmetricKey();
    const enc = encryptRecord(JSON.stringify(contentEnvelope), key);

    // 3) Store encrypted blob in IPFS stub (or real IPFS later)
    const cid = await addJson(enc);

    // 4) Store mapping locally
    localRecords.set(recordId, {
      cid,
      owner: patientAddress,
      keyHex: key.toString("hex"),
      recordIdHash: null
    });

    // 5) TRY to talk to the PrivaMed contract (but don't fail the whole request
    //    if the contract call reverts or contract is not deployed).
    let recordIdHash = null;
    try {
      // Use the "admin" signer (first Ganache account) as the auditor
      const adminSigner = await getSigner(); // account[0] from Ganache
      const contract = await getContract(adminSigner);

      // Ensure the patient is registered as a patient
      await ensureUserRegistered(contract, patientAddress, ROLE_PATIENT);

      // addRecord will now accept msg.sender as Auditor OR Patient
      const tx = await contract.addRecord(cid);
      const receipt = await tx.wait();

      // parse logs to find recordId (from RecordAdded event)
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed.name === "RecordAdded") {
            recordIdHash = parsed.args.recordId;
            break;
          }
        } catch (_) {
          // ignore logs that don't match this contract
        }
      }

      const meta = localRecords.get(recordId);
      if (meta) {
        meta.recordIdHash = recordIdHash;
        localRecords.set(recordId, meta);
      }
    } catch (chainErr) {
      console.error(
        "[CHAIN] Failed to register record on-chain (continuing with off-chain storage only):",
        chainErr
      );
    }

    res.json({ recordId, cid, recordIdHash });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to store record" });
  }
});

// -----------------------------------------------------------------------------
// Fetch a record (decrypt and return envelope: note or file)
// -----------------------------------------------------------------------------
app.get("/api/records/:recordId", async (req, res) => {
  try {
    const { recordId } = req.params;
    const meta = localRecords.get(recordId);
    if (!meta) {
      return res.status(404).json({ error: "record not found" });
    }

    const enc = await getJson(meta.cid);
    const keyBuf = Buffer.from(meta.keyHex, "hex");
    const decrypted = decryptRecord(enc, keyBuf);

    let payload;
    try {
      // New-style encrypted JSON envelope
      payload = JSON.parse(decrypted);
    } catch {
      // Backwards compatibility for legacy plaintext-only notes
      payload = { kind: "note", text: decrypted };
    }

    // NOTE: for production, you would call an on-chain
    // isAuthorized(meta.recordIdHash, actorAddress) check here
    // before returning the decrypted payload.
    res.json({
      recordId,
      payload,
      cid: meta.cid,
      recordIdHash: meta.recordIdHash
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to fetch record" });
  }
});

// -----------------------------------------------------------------------------
// List records owned by a specific patient (off-chain metadata only)
// -----------------------------------------------------------------------------
app.get("/api/patients/:patientAddress/records", async (req, res) => {
  try {
    const { patientAddress } = req.params;
    if (!patientAddress) {
      return res.status(400).json({ error: "patientAddress required" });
    }

    const target = patientAddress.toLowerCase();
    const records = [];

    for (const [recordId, meta] of localRecords.entries()) {
      if (!meta.owner) continue;
      if (meta.owner.toLowerCase() !== target) continue;
      records.push({
        recordId,
        cid: meta.cid,
        recordIdHash: meta.recordIdHash,
        owner: meta.owner
      });
    }

    res.json({ records });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to list patient records" });
  }
});

// -----------------------------------------------------------------------------
// Grant access to a provider
// Body: { recordIdHash, providerAddress, validUntil?, scope? }
// -----------------------------------------------------------------------------
app.post("/api/access/grant", async (req, res) => {
  try {
    const { recordIdHash, providerAddress, validUntil, scope } = req.body;
    if (!recordIdHash || !providerAddress) {
      return res
        .status(400)
        .json({ error: "recordIdHash and providerAddress required" });
    }

    const signer = await getSigner();
    const contract = await getContract(signer);

    // ensure provider is registered
    await ensureUserRegistered(contract, providerAddress, ROLE_PROVIDER);

    const tx = await contract.grantAccess(
      recordIdHash,
      providerAddress,
      validUntil || 0,
      scope || ethers.ZeroHash
    );
    await tx.wait();

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to grant access" });
  }
});

// -----------------------------------------------------------------------------
// Revoke access from a provider
// Body: { recordIdHash, providerAddress }
// -----------------------------------------------------------------------------
app.post("/api/access/revoke", async (req, res) => {
  try {
    const { recordIdHash, providerAddress } = req.body;
    if (!recordIdHash || !providerAddress) {
      return res
        .status(400)
        .json({ error: "recordIdHash and providerAddress required" });
    }

    const signer = await getSigner();
    const contract = await getContract(signer);

    const tx = await contract.revokeAccess(recordIdHash, providerAddress);
    await tx.wait();

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to revoke access" });
  }
});

// -----------------------------------------------------------------------------
// List records a provider has access to
// GET /api/providers/:providerAddress/records
// -----------------------------------------------------------------------------
app.get("/api/providers/:providerAddress/records", async (req, res) => {
  try {
    const { providerAddress } = req.params;
    if (!providerAddress) {
      return res.status(400).json({ error: "providerAddress required" });
    }

    const contract = await getContract(provider); // read-only calls
    const results = [];

    for (const [recordId, meta] of localRecords.entries()) {
      // If this record never got an on-chain ID, it can't participate in
      // contract-based access control, so skip it for the provider view.
      if (!meta.recordIdHash) continue;

      let authorized = false;
      try {
        authorized = await contract.isAuthorized(
          meta.recordIdHash,
          providerAddress
        );
      } catch (err) {
        console.error(
          `[CHAIN] isAuthorized failed for record ${recordId} / provider ${providerAddress}:`,
          err
        );
        // In a demo context, we just treat failure as "not authorized"
        authorized = false;
      }

      if (authorized) {
        results.push({
          recordId,
          cid: meta.cid,
          recordIdHash: meta.recordIdHash,
          owner: meta.owner
        });
      }
    }

    res.json({ records: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to list provider records" });
  }
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`PrivaMed backend listening on port ${PORT}`);
});
