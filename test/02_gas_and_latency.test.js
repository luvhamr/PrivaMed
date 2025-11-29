const PrivaMed = artifacts.require("PrivaMed");
const { expect } = require("chai");

contract("PrivaMed — Gas & Latency Benchmarks", accounts => {
  //=========================================
  // accounts[0] = admin
  //=========================================
  // we'll use other accounts for patient/provider/auditor/test subjects
  const admin = accounts[0];

  // Configurable iterations via environment variable (default 5)
  const ITERATIONS = process.env.ITERATIONS ? parseInt(process.env.ITERATIONS, 10) : 5;

  //=========================================
  // Helper utilities
  //=========================================
  const nowMs = () => new Date().getTime();

  function stats(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
    const count = arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const avg = arr.reduce((s, v) => s + v, 0) / count;
    return { min, max, avg, count };
  }

  async function measureTx(fn) {
    const t0 = nowMs();
    const res = await fn();
    const t1 = nowMs();
    // Truffle transaction result: res.receipt.gasUsed
    const gas = res && res.receipt ? res.receipt.gasUsed : null;
    const latency = t1 - t0; // ms
    return { res, gas, latency };
  }

  async function measureCall(fn) {
    const t0 = nowMs();
    const res = await fn();
    const t1 = nowMs();
    const latency = t1 - t0;
    return { res, latency };
  }

  // Increase timeout for long benchmark runs
  before(function () {
    this.timeout(0);
  });

  it("benchmarks gas and latency for key state-changing functions and call latencies", async function () {
    this.timeout(0); 

    // Prepare arrays to collect metrics
    const metrics = {
      registerUser: { gas: [], latency: [] },
      addRecord: { gas: [], latency: [] },
      grantAccess: { gas: [], latency: [] },
      revokeAccess: { gas: [], latency: [] },
      requestAccess: { gas: [], latency: [] },
      emergencyAccess: { gas: [], latency: [] },
      logAccessEvent: { gas: [], latency: [] },
      // calls (no gas)
      isAuthorized: { latency: [] },
      getRequestCount: { latency: [] },
      getRequest: { latency: [] },
      getRecordCID: { latency: [] }
    };

    const neededAccounts = 1 + (ITERATIONS * 5); // rough upper bound
    if (accounts.length < Math.max(10, neededAccounts)) {
      console.warn("Repository test uses limited accounts; if numbers are low, repeated deploys still work.");
    }

    // For each iteration, deploy a fresh contract to isolate measurements
    for (let i = 0; i < ITERATIONS; i++) {
      // allocate addresses from accounts array for this iteration
      const base = 1 + (i * 4); // skip admin at accounts[0]
      const patient = accounts[base % accounts.length];
      const provider = accounts[(base + 1) % accounts.length];
      const auditor = accounts[(base + 2) % accounts.length];
      const other = accounts[(base + 3) % accounts.length];

      // Deploy new instance
      const instance = await PrivaMed.new({ from: admin });

      // register patient & provider with admin
      const regPatientTx = await instance.registerUser(patient, 1, { from: admin });
      // register provider
      await instance.registerUser(provider, 2, { from: admin });

      //=========================================
      // ---------- registerUser (measure) ----------
      //=========================================
      // use a distinct temporary account for registration to avoid re-register conflicts
      const tempAddr = accounts[(base + 4) % accounts.length];
      const r = await measureTx(() => instance.registerUser(tempAddr, 2, { from: admin }));
      if (r.gas !== null) metrics.registerUser.gas.push(r.gas);
      metrics.registerUser.latency.push(r.latency);

      //=========================================
      // ---------- addRecord ----------
      //=========================================
      // ensure patient is registered already
      const cid = `QmBenchCID_${i}`;
      const txAdd = await measureTx(() => instance.addRecord(cid, { from: patient }));
      // capture returned recordId for downstream operations
      const recordId = txAdd.res.logs[0].args.recordId;
      if (txAdd.gas !== null) metrics.addRecord.gas.push(txAdd.gas);
      metrics.addRecord.latency.push(txAdd.latency);

      //=========================================
      // ---------- grantAccess ----------
      //=========================================
      const grantTx = await measureTx(() =>
        instance.grantAccess(recordId, provider, 0, web3.utils.asciiToHex(""), { from: patient })
      );
      if (grantTx.gas !== null) metrics.grantAccess.gas.push(grantTx.gas);
      metrics.grantAccess.latency.push(grantTx.latency);

      //=========================================
      // ---------- isAuthorized (call) ----------
      //=========================================
      const isAuth = await measureCall(() => instance.isAuthorized.call(recordId, provider));
      metrics.isAuthorized.latency.push(isAuth.latency);

      //=========================================
      // ---------- revokeAccess ----------
      //=========================================
      const revokeTx = await measureTx(() => instance.revokeAccess(recordId, provider, { from: patient }));
      if (revokeTx.gas !== null) metrics.revokeAccess.gas.push(revokeTx.gas);
      metrics.revokeAccess.latency.push(revokeTx.latency);

      // After revoke, isAuthorized call latency again
      const isAuth2 = await measureCall(() => instance.isAuthorized.call(recordId, provider));
      metrics.isAuthorized.latency.push(isAuth2.latency);

      //=========================================
      // ---------- requestAccess ----------
      //=========================================
      // register provider as provider (already done above)
      const reason = "Benchmark request";
      const reqTx = await measureTx(() => instance.requestAccess(recordId, reason, { from: provider }));
      if (reqTx.gas !== null) metrics.requestAccess.gas.push(reqTx.gas);
      metrics.requestAccess.latency.push(reqTx.latency);

      // measure getRequestCount (call)
      const cnt = await measureCall(() => instance.getRequestCount.call());
      metrics.getRequestCount.latency.push(cnt.latency);

      // measure getRequest(0) (call). If no requests exist (should exist), guard with try.
      try {
        const reqCall = await measureCall(() => instance.getRequest.call(0));
        metrics.getRequest.latency.push(reqCall.latency);
      } catch (err) {
        // If getRequest reverts due to invalid id, still record as a small latency measurement
        metrics.getRequest.latency.push(0);
      }

      //=========================================
      // ---------- emergencyAccess ----------
      //=========================================
      const justification = web3.utils.asciiToHex("benchmark");
      const validFor = 60; // seconds
      const emergTx = await measureTx(() =>
        instance.emergencyAccess(recordId, justification, validFor, { from: provider })
      );
      if (emergTx.gas !== null) metrics.emergencyAccess.gas.push(emergTx.gas);
      metrics.emergencyAccess.latency.push(emergTx.latency);

      //=========================================
      // ---------- logAccessEvent ----------
      //=========================================
      const logTx = await measureTx(() =>
        instance.logAccessEvent(recordId, provider, true, "BENCH_READ", { from: other })
      );
      if (logTx.gas !== null) metrics.logAccessEvent.gas.push(logTx.gas);
      metrics.logAccessEvent.latency.push(logTx.latency);

      //=========================================
      //---------- getRecordCID (call) ----------
      //=========================================
      const cidCall = await measureCall(() => instance.getRecordCID.call(recordId));
      metrics.getRecordCID.latency.push(cidCall.latency);

    } // end iterations

    //=========================================
    // Compute and print summaries
    //=========================================
    function printMetric(name, metricObj) {
      console.log("------------------------------------------------------------");
      console.log(`Function: ${name}`);
      if (metricObj.gas) {
        const sGas = stats(metricObj.gas);
        console.log(`  Gas - count: ${sGas.count}, min: ${sGas.min}, max: ${sGas.max}, avg: ${sGas.avg.toFixed(2)}`);
      }
      if (metricObj.latency) {
        const sLat = stats(metricObj.latency);
        console.log(
          `  Latency(ms) - count: ${sLat.count}, min: ${sLat.min} ms, max: ${sLat.max} ms, avg: ${sLat.avg.toFixed(
            2
          )} ms`
        );
      }
    }

    console.log("\nBenchmark summary (over " + ITERATIONS + " iterations):");
    Object.keys(metrics).forEach(k => printMetric(k, metrics[k]));

    // Sanity checks
    expect(metrics.addRecord.gas.length).to.be.at.least(1);
    expect(metrics.registerUser.gas.length).to.be.at.least(1);
    expect(metrics.grantAccess.gas.length).to.be.at.least(1);

    // Test ends successfully after printing summary
  });
});
