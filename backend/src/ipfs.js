// backend/src/ipfs.js
// Dev stub: in-memory "IPFS-like" storage for JSON objects.
// This avoids needing a real IPFS daemon when developing locally.

const IPFS_API_URL = process.env.IPFS_API || "http://localhost:5001";

// Simple local store keyed by fake CIDs
const localStore = new Map();
let counter = 0;

/**
 * Simulate adding JSON to IPFS.
 * Returns a fake CID string like "local-0", "local-1", ...
 */
async function addJson(obj) {
  const cid = `local-${counter++}`;
  localStore.set(cid, obj);
  console.log(`[IPFS-STUB] Stored JSON under CID ${cid}`);
  return cid;
}

/**
 * Simulate fetching JSON from IPFS by CID.
 */
async function getJson(cid) {
  if (!localStore.has(cid)) {
    throw new Error(`[IPFS-STUB] No entry for CID ${cid}`);
  }
  console.log(`[IPFS-STUB] Loaded JSON from CID ${cid}`);
  return localStore.get(cid);
}

module.exports = { addJson, getJson, IPFS_API_URL };
