const PrivaMed = artifacts.require("PrivaMed");
const { expect } = require("chai");

contract("PrivaMed", accounts => {
  const admin = accounts[0];
  const patient = accounts[1];
  const provider = accounts[2];
  const auditor = accounts[3];
  const stranger = accounts[4];

  let instance;

  //===========================================
  // Helpers 
  //===========================================
  const roleToNumber = (r) => {
    // r might be a BN, string, or object with toNumber
    if (r == null) return null;
    if (typeof r === "object" && typeof r.toNumber === "function") {
      return r.toNumber();
    }
    if (typeof r === "string") {
      if (r.startsWith("0x")) return parseInt(r, 16);
      return parseInt(r, 10);
    }
    return Number(r);
  };

  beforeEach(async () => {
    instance = await PrivaMed.new({ from: admin });
    // admin registers patient and provider
    await instance.registerUser(patient, 1, { from: admin });  // Role.Patient = 1
    await instance.registerUser(provider, 2, { from: admin }); // Role.Provider = 2
  });

  //===========================================
  // Set user roles 
  //===========================================
  it("admin registration sets user role and exists", async () => {
    const u = await instance.users(patient);
    // u.role may be a BN / string; check robustly
    expect(roleToNumber(u.role)).to.equal(1);
    // exists should be truthy
    // Some providers return boolean, some return string; coerce to boolean
    expect(Boolean(u.exists)).to.equal(true);
  });

  //===========================================
  // Admin-only user registration
  //===========================================
  it("non-admin cannot register a user", async () => {
    try {
      await instance.registerUser(stranger, 2, { from: stranger });
      expect.fail("Expected registerUser to revert for non-admin");
    } catch (err) {
      expect(err.message).to.include("Admin only");
    }
  });

  //===========================================
  // Add records/Grant access 
  //===========================================
  it("patient adds record and grants provider access", async () => {
    const cid = "QmTestCID";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    await instance.grantAccess(recordId, provider, 0, web3.utils.asciiToHex(""), { from: patient });

    const auth = await instance.isAuthorized(recordId, provider);
    expect(auth).to.be.true;
  });

  //===========================================
  // Revoke access
  //===========================================
  it("revocation denies access", async () => {
    const cid = "QmTestCID2";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    await instance.grantAccess(recordId, provider, 0, web3.utils.asciiToHex(""), { from: patient });
    await instance.revokeAccess(recordId, provider, { from: patient });

    const auth = await instance.isAuthorized(recordId, provider);
    expect(auth).to.be.false;
  });

  //===========================================
  // Add record protocols
  //===========================================
  it("provider cannot addRecord (only patient or auditor)", async () => {
    try {
      await instance.addRecord("QmBad", { from: provider });
      expect.fail("Expected addRecord to revert when called by provider");
    } catch (err) {
      expect(err.message).to.include("Only patient or auditor may add records");
    }
  });

  //===========================================
  // Auditor privileges
  //===========================================
  it("auditor can addRecord and becomes owner (auditor role)", async () => {
    // register auditor
    await instance.registerUser(auditor, 3, { from: admin }); // Role.Auditor = 3
    const cid = "QmAuditorCID";
    const tx = await instance.addRecord(cid, { from: auditor });
    const recordId = tx.logs[0].args.recordId;

    const rec = await instance.records(recordId);
    // owner should equal auditor address
    expect(rec.owner).to.equal(auditor);

    const fetchedCid = await instance.getRecordCID(recordId);
    expect(fetchedCid).to.equal(cid);
  });

  //===========================================
  // Request access protocol 
  //===========================================
  it("provider can request access and requests are indexed", async () => {
    const cid = "QmReqCID";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    const reason = "Needed for treatment";
    await instance.requestAccess(recordId, reason, { from: provider });

    const count = await instance.getRequestCount();
    expect(count.toString()).to.equal("1");

    const req = await instance.getRequest(0);
    expect(req.requester).to.equal(provider);
    // recordId is bytes32 - compare as hex string
    expect(req.recordId).to.equal(recordId);
    expect(req.reason).to.equal(reason);
  });

  //===========================================
  // Access expiry protocol
  //===========================================
  it("requestAccess reverts when called by non-provider", async () => {
    const cid = "QmReqCID2";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    try {
      await instance.requestAccess(recordId, "reason", { from: patient });
      expect.fail("Expected requestAccess to revert when called by non-provider");
    } catch (err) {
      expect(err.message).to.include("Only provider may request");
    }
  });

  //===========================================
  // Emergency access protocol
  //===========================================
  it("emergencyAccess grants temporary access and emits event", async () => {
    const cid = "QmEmergCID";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    // provider must be registered (done in beforeEach)
    const justification = web3.utils.asciiToHex("justified");
    const validFor = 3600; // seconds
    const tx = await instance.emergencyAccess(recordId, justification, validFor, { from: provider });

    // event emitted
    const logs = tx.logs;
    const ev = logs.find(l => l.event === "EmergencyAccess");
    expect(ev, "EmergencyAccess event should be emitted").to.exist;
    expect(ev.args.recordId).to.equal(recordId);
    expect(ev.args.actor).to.equal(provider);

    // provider should now be authorized
    const auth = await instance.isAuthorized(recordId, provider);
    expect(auth).to.be.true;
  });

  //===========================================
  // Event logging
  //===========================================
  it("logAccessEvent emits AccessEvent and is callable by anyone for existing record", async () => {
    const cid = "QmLogCID";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    const tx = await instance.logAccessEvent(recordId, provider, true, "READ", { from: stranger });
    const ev = tx.logs.find(l => l.event === "AccessEvent");
    expect(ev, "AccessEvent should be emitted").to.exist;
    expect(ev.args.recordId).to.equal(recordId);
    expect(ev.args.actor).to.equal(provider);
    expect(ev.args.success).to.equal(true);
    expect(ev.args.action).to.equal("READ");
  });

  //===========================================
  // Off-chain record access
  //===========================================
  it("getRecordCID returns correct CID", async () => {
    const cid = "QmCID123";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    const fetched = await instance.getRecordCID(recordId);
    expect(fetched).to.equal(cid);
  });
});
