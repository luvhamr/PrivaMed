const crypto = require("crypto");

const ALGO = "aes-256-gcm";

function generateSymmetricKey() {
  return crypto.randomBytes(32);
}

function encryptRecord(plaintext, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuf, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: enc.toString("hex")
  };
}

function decryptRecord(encObj, keyBuf) {
  const iv = Buffer.from(encObj.iv, "hex");
  const tag = Buffer.from(encObj.tag, "hex");
  const data = Buffer.from(encObj.ciphertext, "hex");
  const decipher = crypto.createDecipheriv(ALGO, keyBuf, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

module.exports = { generateSymmetricKey, encryptRecord, decryptRecord };
