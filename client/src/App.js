import React, { useState } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:3333";

const roles = ["PATIENT", "PHYSICIAN", "RESPONDER", "AUDITOR"];

function App() {
  const [role, setRole] = useState("PATIENT");
  const [address, setAddress] = useState("0xPatientAddress");
  const [recordId, setRecordId] = useState("record-1");
  const [recordText, setRecordText] = useState("Example clinical note...");
  const [loadedRecord, setLoadedRecord] = useState(null);
  const [status, setStatus] = useState("");

  const uploadRecord = async () => {
    try {
      setStatus("Uploading & encrypting...");
      const res = await axios.post(`${API_BASE}/api/records`, {
        patientAddress: address,
        recordId,
        plaintext: recordText
      });
      setStatus(`Stored record ${res.data.recordId} (CID ${res.data.cid})`);
    } catch (e) {
      console.error(e);
      setStatus("Upload failed");
    }
  };

  const fetchRecord = async () => {
    try {
      setStatus("Fetching & decrypting...");
      const res = await axios.get(`${API_BASE}/api/records/${recordId}`);
      setLoadedRecord(res.data.plaintext);
      setStatus("Record loaded");
    } catch (e) {
      console.error(e);
      setStatus("Fetch failed");
    }
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1>PrivaMed PoC</h1>
      <p>Decentralized Medical Record Access & Audit (skeleton)</p>

      <section>
        <h2>Role & Address</h2>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <input
          style={{ marginLeft: "0.5rem", width: "20rem" }}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0xYourWallet"
        />
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h2>Patient: Add Record</h2>
        <input
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
          style={{ width: "10rem" }}
        />
        <div>
          <textarea
            rows={5}
            cols={60}
            value={recordText}
            onChange={(e) => setRecordText(e.target.value)}
          />
        </div>
        <button onClick={uploadRecord} style={{ marginTop: "0.5rem" }}>
          Upload & Encrypt
        </button>
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h2>Clinician/Responder: Fetch Record</h2>
        <button onClick={fetchRecord}>Fetch & Decrypt</button>
        {loadedRecord && (
          <pre
            style={{
              marginTop: "0.5rem",
              background: "#f4f4f4",
              padding: "0.75rem",
              borderRadius: "4px"
            }}
          >
            {loadedRecord}
          </pre>
        )}
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h2>Status</h2>
        <code>{status}</code>
      </section>
    </div>
  );
}

export default App;
