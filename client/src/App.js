import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import bgPattern from "./assets/privamed-bg.svg";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:3333";
const ROLES = ["PATIENT", "PHYSICIAN", "RESPONDER", "AUDITOR"];

const NAV_ITEMS = [
  { label: "Overview" },
  { label: "Patient List" },
  { label: "Appointments" },
  { label: "Lab Reports" },
  { label: "Access" },
  { label: "Settings" }
];

const VITALS = [
  { label: "Age", value: "32 yrs" },
  { label: "Height", value: "163 cm" },
  { label: "Weight", value: "55 kg" },
  { label: "Blood Type", value: "O+" },
  { label: "Allergies", value: "Penicillin" },
  { label: "Last Visit", value: "Apr 21, 2025" }
];

const TREATMENTS = [
  { date: "29 Nov '25", title: "Open Access", place: "Telehealth", status: "Scheduled" },
  { date: "07 Dec '25", title: "Cardio Consult", place: "Room 402", status: "Confirmed" },
  { date: "12 Dec '25", title: "Rehab Session", place: "East Wing", status: "Pending" }
];

const DOCUMENTS = [
  { name: "CT Thorax.pdf", type: "PDF", size: "2.1 MB" },
  { name: "Lab Panel 04-21.csv", type: "CSV", size: "640 KB" },
  { name: "ER Note.docx", type: "DOCX", size: "320 KB" }
];

export default function App() {
  const [role, setRole] = useState("PATIENT");
  const [address, setAddress] = useState("0xA1C3...BEEF");
  const [status, setStatus] = useState("Ready");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [noteRecordId, setNoteRecordId] = useState("note-diane-1");
  const [noteText, setNoteText] = useState("");
const [fileToUpload, setFileToUpload] = useState(null);
const [activeNav, setActiveNav] = useState("Patient List");

  const [activeTab, setActiveTab] = useState("upcoming");
  const [notifications, setNotifications] = useState([
    { id: 1, title: "Clinical note uploaded", time: "2m" },
    { id: 2, title: "Dr. Lee shared labs", time: "1h" }
  ]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // New state for Access page
  const [patientAddress, setPatientAddress] = useState("");
  const [providers, setProviders] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");

  const canUpload = useMemo(() => role === "PATIENT" && address, [role, address]);
  const signedIn = Boolean(address);
  const shellStyle = useMemo(
    () => ({
      backgroundImage: `url(${bgPattern})`,
      backgroundSize: "cover",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      backgroundPosition: "center",
      backgroundColor: "var(--bg)"
    }),
    []
  );

  // Current record object from records[] based on selectedRecordId
  const selectedRecord = useMemo(
    () => records.find((r) => r.recordId === selectedRecordId) || null,
    [records, selectedRecordId]
  );

  // Load accounts from backend: account 0 = patient, others = providers
    // Load accounts from backend: account 0 = patient, others = providers
  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        const res = await axios.get(`${API_BASE}/api/accounts`);
        if (cancelled) return;

        const accounts = res.data.accounts || [];
        if (accounts.length > 0) {
          setPatientAddress(accounts[0]);
          setAddress(accounts[0]); // keep "signed-in" address in sync
          const provs = accounts.slice(1);
          setProviders(provs);
          if (provs.length > 0) {
            setSelectedProvider(provs[0]);
          }
          setStatus("Accounts loaded from Ganache.");
        } else {
          setStatus("No accounts returned from backend.");
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setStatus("Failed to load accounts from backend.");
        }
      }
    }

    loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [API_BASE]);


  // Existing Notes-card upload (Save & Encrypt)
  async function uploadRecord() {
    if (!canUpload) {
      setStatus("Switch to PATIENT role and provide an address to upload.");
      return;
    }
    setStatus("Encrypting & storing note...");
    try {
      let cid = "cid:demo";
      try {
        const res = await axios.post(`${API_BASE}/api/records`, {
          patientAddress: address,
          recordId: noteRecordId,
          plaintext: noteText
        });
        cid = res.data.cid || cid;
      } catch (_) {
        // backend offline; keep simulated CID
      }
      setStatus(`Note saved securely (CID ${cid})`);
    } catch (err) {
      console.error(err);
      setStatus("Unable to store note");
    }
  }

  function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      // result looks like "data:application/pdf;base64,AAAA..."
      const [, base64] = result.split(",");
      resolve(base64 || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

  // === Access page handlers ===
  async function handleAccessUpload(e) {
  e.preventDefault();

  if (!patientAddress) {
    setStatus("No patient address loaded yet.");
    return;
  }
  if (!noteRecordId.trim() && !fileToUpload) {
    setStatus("Record ID is required when uploading.");
    return;
  }
  if (!noteText.trim() && !fileToUpload) {
    setStatus("Either note text or a file is required.");
    return;
  }

  try {
    setStatus("Uploading encrypted record...");

    let fileMeta = null;
    if (fileToUpload) {
      const base64 = await fileToBase64(fileToUpload);
      fileMeta = {
        name: fileToUpload.name,
        type: fileToUpload.type,
        size: fileToUpload.size,
        base64
      };
    }

    const res = await axios.post(`${API_BASE}/api/records`, {
      patientAddress,
      recordId: noteRecordId,
      plaintext: noteText,
      fileMeta
    });

    const newRecord = {
      recordId: res.data.recordId,
      cid: res.data.cid,
      recordIdHash: res.data.recordIdHash
    };

    setRecords((prev) => [...prev, newRecord]);
    setSelectedRecordId(newRecord.recordId);
    setFileToUpload(null);
    setStatus("Record stored and registered on-chain.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to upload record.");
  }
}


  async function handleGrantAccess(e) {
    e.preventDefault();
    if (!selectedRecord || !selectedProvider) {
      setStatus("Select a record and a provider first.");
      return;
    }

    try {
      setStatus("Granting access...");
      await axios.post(`${API_BASE}/api/access/grant`, {
        recordIdHash: selectedRecord.recordIdHash,
        providerAddress: selectedProvider,
        validUntil: 0,
        scope: null
      });
      setStatus("Access granted.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to grant access.");
    }
  }

  async function handleRevokeAccess(e) {
    e.preventDefault();
    if (!selectedRecord || !selectedProvider) {
      setStatus("Select a record and a provider first.");
      return;
    }

    try {
      setStatus("Revoking access...");
      await axios.post(`${API_BASE}/api/access/revoke`, {
        recordIdHash: selectedRecord.recordIdHash,
        providerAddress: selectedProvider
      });
      setStatus("Access revoked.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to revoke access.");
    }
  }

  function handleNavClick(label) {
    setActiveNav(label);
    setStatus(`Navigated to ${label}`);
  }

  function handleMessageClick() {
    setStatus("Opening secure message composer...");
    window.setTimeout(() => setStatus("Message composer ready (demo)"), 600);
  }

  function handleDownload(doc) {
    setStatus(`Preparing download for ${doc.name}`);
    window.setTimeout(() => setStatus(`Downloaded ${doc.name}`), 800);
  }

  function handleTabChange(tabKey) {
    setActiveTab(tabKey);
    setStatus(
      `Showing ${
        tabKey === "upcoming"
          ? "upcoming treatments"
          : tabKey === "past"
          ? "past appointments"
          : "prescriptions"
      }`
    );
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!searchValue.trim()) {
      setStatus("Enter a keyword to search");
      return;
    }
    setStatus(`Searching records for "${searchValue}" (demo)`);
  }

  function handleNotificationsClick() {
    setNotificationsOpen((open) => !open);
    if (notifications.length === 0) {
      setStatus("No notifications");
    } else {
      setStatus("Notifications shown");
    }
  }

  function dismissNotification(id) {
    setNotifications((items) => items.filter((n) => n.id !== id));
    setStatus("Notification dismissed");
  }

  const timelineData =
    activeTab === "past"
      ? [
          { date: "04 Aug '25", title: "Primary Care", place: "Room 210", status: "Completed" },
          { date: "18 Jul '25", title: "Lab Panel", place: "Diagnostics", status: "Completed" }
        ]
      : activeTab === "prescriptions"
      ? [
          { date: "Current", title: "Atorvastatin", place: "20mg daily", status: "Active" },
          { date: "Current", title: "Metformin", place: "500mg BID", status: "Active" }
        ]
      : TREATMENTS;

  return (
    <div className="shell" style={shellStyle}>
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="logo-row">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen((s) => !s)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <span className="logo">PrivaMed</span>
        </div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              onClick={() => handleNavClick(item.label)}
            >
              <span className="nav-dot" />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="role-box">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>{activeNav}</span>
            <span className="crumb">›</span>
            <strong>Diane Cooper</strong>
          </div>
          <div className="header-actions">
            <form onSubmit={handleSearchSubmit}>
              <input
                className="search"
                placeholder="Search records"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </form>
            <div className="notifications-area">
              <button
                className="icon-btn"
                aria-label="Notifications"
                onClick={handleNotificationsClick}
              >
                🔔
                {notifications.length > 0 && <span className="dot">{notifications.length}</span>}
              </button>
              {notificationsOpen && (
                <div className="notifications-menu">
                  <header>
                    <strong>Notifications</strong>
                    <button
                      onClick={() => {
                        setNotifications([]);
                        setStatus("All notifications cleared");
                      }}
                    >
                      Clear all
                    </button>
                  </header>
                  {notifications.length === 0 ? (
                    <p className="muted">No new alerts</p>
                  ) : (
                    <ul>
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <div>
                            <strong>{n.title}</strong>
                            <span>{n.time} ago</span>
                          </div>
                          <button onClick={() => dismissNotification(n.id)}>Dismiss</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="profile-area">
              <button className="profile-btn" onClick={() => setProfileOpen((p) => !p)}>
                <span className="avatar-small">DC</span>
                <span className="caret">▾</span>
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-item">
                    Signed in as
                    <br />
                    <code>{signedIn ? address : "Not signed"}</code>
                  </div>
                  <hr />
                  {!signedIn ? (
                    <button
                      className="profile-action"
                      onClick={() => {
                        const addr = window.prompt("Demo address (0x...)");
                        if (addr) {
                          setAddress(addr);
                          setProfileOpen(false);
                          setStatus("Signed in");
                        }
                      }}
                    >
                      Sign In
                    </button>
                  ) : (
                    <button
                      className="profile-action"
                      onClick={() => {
                        setAddress("");
                        setProfileOpen(false);
                        setStatus("Signed out");
                      }}
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {activeNav === "Access" ? (
          // ==========================
          // ACCESS PAGE
          // ==========================
          <section className="overview-grid">
            <div className="card patient-card">
              <div className="patient-header">
                <div className="patient-avatar blank-avatar" aria-hidden="true">
                  AC
                </div>
                <div>
                  <h2>Access Control</h2>
                  <p>
                    Patient:{" "}
                    <code>{patientAddress || "Loading accounts from Ganache..."}</code>
                  </p>
                </div>
              </div>

              <form className="access-form" onSubmit={handleAccessUpload}>
  <h3>Upload medical record</h3>

  <label className="field">
    <span>Record ID</span>
    <input
      type="text"
      value={noteRecordId}
      onChange={(e) => setNoteRecordId(e.target.value)}
      placeholder="e.g. note-001"
    />
  </label>

  <label className="field">
    <span>Note text</span>
    <textarea
      rows={4}
      value={noteText}
      onChange={(e) => setNoteText(e.target.value)}
      placeholder="Paste or type the clinical note..."
    />
  </label>

  <label className="field">
    <span>Attach file (optional)</span>
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files && e.target.files[0];
        setFileToUpload(file || null);
      }}
    />
    {fileToUpload && (
      <small>
        Selected: {fileToUpload.name} ({Math.round(fileToUpload.size / 1024)} KB)
      </small>
    )}
  </label>

  <button type="submit" className="btn-primary">
    Upload & register on-chain
  </button>
</form>


              <div className="records-list">
                <h3>Records</h3>
                {records.length === 0 ? (
                  <p>No records yet. Upload one above.</p>
                ) : (
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>Record ID</th>
                        <th>CID</th>
                        <th>On-chain ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr
                          key={r.recordId}
                          onClick={() => setSelectedRecordId(r.recordId)}
                          style={{
                            cursor: "pointer",
                            background:
                              selectedRecordId === r.recordId
                                ? "rgba(0,0,0,0.04)"
                                : "transparent"
                          }}
                        >
                          <td>{r.recordId}</td>
                          <td>{r.cid}</td>
                          <td>{r.recordIdHash || "pending"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card notes-card">
              <h3>Grant / revoke provider access</h3>
              <form className="access-form" onSubmit={handleGrantAccess}>
                <label className="field">
                  <span>Selected record</span>
                  <input
                    type="text"
                    value={selectedRecordId || ""}
                    readOnly
                    placeholder="Click a record in the table on the left"
                  />
                </label>

                <label className="field">
                  <span>Provider address</span>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                  >
                    <option value="">Select a provider</option>
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="actions">
                  <button type="submit" className="btn-primary">
                    Grant access
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleRevokeAccess}
                  >
                    Revoke access
                  </button>
                </div>
              </form>
            </div>

            <div className="card status-card">
              <h3>Status</h3>
              <p>{status}</p>
              <div className="role-info">
                <span>Role</span>
                <strong>{role}</strong>
              </div>
              <div className="role-info">
                <span>Address</span>
                <code>{address || "Not set"}</code>
              </div>
            </div>
          </section>
        ) : (
          // ==========================
          // EXISTING DASHBOARD
          // ==========================
          <>
            <section className="overview-grid">
              <div className="card patient-card">
                <div className="patient-header">
                  <div className="patient-avatar blank-avatar" aria-hidden="true">
                    DC
                  </div>
                  <div>
                    <h2>Diane Cooper</h2>
                    <p>ID 0xPatientA · Chicago, IL</p>
                  </div>
                  <button className="btn-outline" onClick={handleMessageClick}>
                    Message
                  </button>
                </div>
                <div className="vitals-grid">
                  {VITALS.map((v) => (
                    <div key={v.label} className="vital">
                      <span className="v-label">{v.label}</span>
                      <strong>{v.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card notes-card">
                <div className="notes-header">
                  <h3>Notes</h3>
                  <select
                    value={noteRecordId}
                    onChange={(e) => setNoteRecordId(e.target.value)}
                  >
                    <option value="note-diane-1">Clinic Note</option>
                    <option value="note-diane-2">Telehealth</option>
                  </select>
                </div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={6}
                />
                <button
                  className="btn-primary"
                  onClick={uploadRecord}
                  disabled={!canUpload}
                >
                  Save & Encrypt
                </button>
              </div>

              <div className="card files-card">
                <h3>Files / Documents</h3>
                <ul>
                  {DOCUMENTS.map((doc) => (
                    <li key={doc.name}>
                      <div>
                        <strong>{doc.name}</strong>
                        <span>
                          {doc.type} · {doc.size}
                        </span>
                      </div>
                      <button
                        className="icon-btn"
                        aria-label="Download"
                        onClick={() => handleDownload(doc)}
                      >
                        ⬇️
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="timeline-row">
              <div className="card timeline-card">
                <div className="tabs">
                  <button
                    className={`tab ${activeTab === "upcoming" ? "active" : ""}`}
                    onClick={() => handleTabChange("upcoming")}
                  >
                    Upcoming Treatments
                  </button>
                  <button
                    className={`tab ${activeTab === "past" ? "active" : ""}`}
                    onClick={() => handleTabChange("past")}
                  >
                    Past Appointments
                  </button>
                  <button
                    className={`tab ${activeTab === "rx" ? "active" : ""}`}
                    onClick={() => handleTabChange("rx")}
                  >
                    Prescriptions
                  </button>
                </div>
                <div className="timeline">
                  {timelineData.map((t) => (
                    <div key={t.title} className="timeline-item">
                      <div className="timeline-date">{t.date}</div>
                      <div className="timeline-body">
                        <strong>{t.title}</strong>
                        <span>{t.place}</span>
                      </div>
                      <span className="badge">{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card status-card">
                <h3>Status</h3>
                <p>{status}</p>
                <div className="role-info">
                  <span>Role</span>
                  <strong>{role}</strong>
                </div>
                <div className="role-info">
                  <span>Address</span>
                  <code>{address || "Not set"}</code>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
