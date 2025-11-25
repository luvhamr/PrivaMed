// backend/src/ipfs.js
// Real IPFS client version compatible with ESM-only ipfs-http-client in a CJS backend.

console.log("LOADED ipfs.js FROM:", __filename);
const { TextDecoder } = require("util");

// Lazy-load the ESM ipfs-http-client using dynamic import
let ipfsPromise = null;

async function getIpfs() {
  if (!ipfsPromise) {
    ipfsPromise = import("ipfs-http-client").then((mod) => {
      // ipfs-http-client exports { create }
      const create = mod.create;
      if (typeof create !== "function") {
        throw new Error("ipfs-http-client: 'create' export not found");
      }
      return create({
        url: process.env.IPFS_API_URL || "http://127.0.0.1:5001"
      });
    });
  }
  return ipfsPromise;
}

// Store an arbitrary JSON-serializable object in IPFS
// Returns a real IPFS CID string like "Qm..." or "bafy..."
async function addJson(obj) {
  const ipfs = await getIpfs();
  const data = JSON.stringify(obj);
  const { cid } = await ipfs.add(data);
  const cidStr = cid.toString();
  console.log("[IPFS] Stored JSON under CID", cidStr);
  return cidStr;
}

// Fetch JSON from IPFS by CID and parse it
async function getJson(cid) {
  const ipfs = await getIpfs();
  const decoder = new TextDecoder();
  let content = "";

  for await (const chunk of ipfs.cat(cid)) {
    content += decoder.decode(chunk, { stream: true });
  }
  content += decoder.decode();

  return JSON.parse(content);
}

module.exports = { addJson, getJson };
