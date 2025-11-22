const PrivaMed = artifacts.require("PrivaMed");
const { expect } = require("chai");

contract("PrivaMed", accounts => {
  const admin = accounts[0];
  const patient = accounts[1];
  const provider = accounts[2];

  let instance;

  beforeEach(async () => {
    instance = await PrivaMed.new({ from: admin });
    // admin registers patient and provider
    await instance.registerUser(patient, 1, { from: admin });  // Role.Patient = 1
    await instance.registerUser(provider, 2, { from: admin }); // Role.Provider = 2
  });

  it("patient adds record and grants provider access", async () => {
    const cid = "QmTestCID";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    await instance.grantAccess(recordId, provider, 0, web3.utils.asciiToHex(""), { from: patient });

    const auth = await instance.isAuthorized(recordId, provider);
    expect(auth).to.be.true;
  });

  it("revocation denies access", async () => {
    const cid = "QmTestCID2";
    const txAdd = await instance.addRecord(cid, { from: patient });
    const recordId = txAdd.logs[0].args.recordId;

    await instance.grantAccess(recordId, provider, 0, web3.utils.asciiToHex(""), { from: patient });
    await instance.revokeAccess(recordId, provider, { from: patient });

    const auth = await instance.isAuthorized(recordId, provider);
    expect(auth).to.be.false;
  });
});

