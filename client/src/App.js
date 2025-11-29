import React, { useMemo, useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";
import bgPattern from "./assets/privamed-bg.svg";
import FileViewerModal from "./components/FileViewerModal";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:3333";

const ROLES = [
  "PATIENT",
  "KAISER",
  "SUTTER_HEALTH",
  "MERCY_MEDICAL",
  "UC_DAVIS_HEALTH",
  "STANFORD_HEALTH",
  "MAYO_CLINIC",
  "CEDARS_SINAI",
  "DIGNITY_HEALTH",
  "ADVENTIST_HEALTH"
];

const FOOTER_LOG_LIMIT = 12;

export default function App() {
  const [role, setRole] = useState("PATIENT");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Ready");
  const [statusLog, setStatusLog] = useState(() => [
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString(),
      message: "Ready"
    }
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [noteRecordId, setNoteRecordId] = useState("note-diane-1");
  const [noteText, setNoteText] = useState("");
  const [fileToUpload, setFileToUpload] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [showAdvancedLogs, setShowAdvancedLogs] = useState(false);
  const [chainLogs, setChainLogs] = useState([]);
  const [chainLogsLoading, setChainLogsLoading] = useState(false);

  const [patientAddress, setPatientAddress] = useState("");
  const [providers, setProviders] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providerRecords, setProviderRecords] = useState([]);
  const [viewingRecord, setViewingRecord] = useState(null);

  const logStatus = useCallback((message) => {
    setStatus(message);
    setStatusLog((prev) => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
        message
      };
      const next = [entry, ...prev];
      return next.slice(0, FOOTER_LOG_LIMIT);
    });
  }, []);

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

  const selectedRecord = useMemo(
    () => records.find((r) => r.recordId === selectedRecordId) || null,
    [records, selectedRecordId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        logStatus("Requesting Ganache accounts...");
        const res = await axios.get(`${API_BASE}/api/accounts`);
        if (cancelled) return;

        const accounts = res.data.accounts || [];
        if (!accounts.length) {
          logStatus("No accounts returned from backend.");
          return;
        }

        setPatientAddress(accounts[0]);
        setAddress(accounts[0]);
        const provs = accounts.slice(1);
        setProviders(provs);
        if (provs.length > 0) {
          setSelectedProvider(provs[0]);
        }
        logStatus("Accounts loaded from backend.");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          logStatus("Failed to load accounts from backend.");
        }
      }
    }

    loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [logStatus]);

  const refreshPatientRecords = useCallback(
    async (options = {}) => {
      if (!patientAddress) {
        setRecords([]);
        setSelectedRecordId("");
        return;
      }

      if (!options.silent) {
        logStatus("Loading patient records...");
      }

      try {
        const res = await axios.get(
          `${API_BASE}/api/patients/${patientAddress}/records`
        );
        const payload = res.data.records || [];

        setRecords(payload);
        setSelectedRecordId((prev) => {
          if (prev && payload.some((r) => r.recordId === prev)) {
            return prev;
          }
          return payload[0]?.recordId || "";
        });

        if (!options.silent) {
          logStatus(`Loaded ${payload.length} patient records.`);
        }
      } catch (err) {
        console.error(err);
        logStatus("Failed to load patient records.");
      }
    },
    [patientAddress, logStatus]
  );

  useEffect(() => {
    refreshPatientRecords();
  }, [refreshPatientRecords]);

  const fetchNotifications = useCallback(
    async (options = {}) => {
      if (role === "PATIENT" || !address) {
        setNotifications([]);
        return;
      }

      const silent = Boolean(options.silent);

      try {
        const res = await axios.get(
          `${API_BASE}/api/providers/${address}/notifications`
        );
        setNotifications(res.data.notifications || []);
        if (!silent) {
          logStatus(
            `Loaded ${res.data.notifications?.length || 0} notifications.`
          );
        }
      } catch (err) {
        console.error(err);
        if (!silent) {
          logStatus("Failed to load notifications.");
        }
      }
    },
    [role, address, logStatus]
  );

  useEffect(() => {
    let intervalId = null;

    fetchNotifications({ silent: true });

    if (role !== "PATIENT" && address) {
      intervalId = window.setInterval(() => {
        fetchNotifications({ silent: true });
      }, 10000);
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [fetchNotifications, role, address]);

  const fetchChainLogs = useCallback(
    async (options = {}) => {
      const silent = Boolean(options.silent);
      setChainLogsLoading(true);

      try {
        const res = await axios.get(`${API_BASE}/api/logs`);
        setChainLogs(res.data.logs || []);
        if (!silent) {
          logStatus(
            `Loaded ${res.data.logs?.length || 0} advanced chain logs.`
          );
        }
      } catch (err) {
        console.error(err);
        if (!silent) {
          logStatus("Failed to load chain logs.");
        }
      } finally {
        setChainLogsLoading(false);
      }
    },
    [logStatus]
  );

  useEffect(() => {
    if (!showAdvancedLogs) {
      return undefined;
    }

    fetchChainLogs({ silent: true });
    const intervalId = window.setInterval(() => {
      fetchChainLogs({ silent: true });
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [showAdvancedLogs, fetchChainLogs]);

  useEffect(() => {
    async function loadProviderRecords() {
      if (role === "PATIENT") {
        setProviderRecords([]);
        return;
      }
      if (!address) {
        logStatus("Provider address unavailable.");
        return;
      }

      try {
        logStatus("Loading provider-linked records...");
        const res = await axios.get(`${API_BASE}/api/providers/${address}/records`);
        setProviderRecords(res.data.records || []);
        logStatus(
          `Loaded ${res.data.records?.length || 0} records for provider ${address}`
        );
      } catch (err) {
        console.error(err);
        logStatus("Failed to load provider records.");
      }
    }

    loadProviderRecords();
  }, [role, address, logStatus]);

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const [, base64] = result.split(",");
        resolve(base64 || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleAccessUpload(e) {
    e.preventDefault();

    if (!patientAddress) {
      logStatus("No patient address loaded yet.");
      return;
    }
    if (!noteRecordId.trim()) {
      logStatus("Record ID is required when uploading.");
      return;
    }
    if (!noteText.trim() && !fileToUpload) {
      logStatus("Either note text or a file is required.");
      return;
    }

    try {
      logStatus("Uploading encrypted record...");

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

      setSelectedRecordId(res.data.recordId);
      setFileToUpload(null);
      logStatus("Record stored and registered on-chain.");
      await refreshPatientRecords({ silent: true });
    } catch (err) {
      console.error(err);
      logStatus("Failed to upload record.");
    }
  }

  async function handleGrantAccess(e) {
    e.preventDefault();
    if (!selectedRecord || !selectedProvider) {
      logStatus("Select a record and a provider first.");
      return;
    }
    if (!selectedRecord.recordIdHash) {
      logStatus("Record has not been registered on-chain yet.");
      return;
    }

    try {
      logStatus("Granting access...");
      await axios.post(`${API_BASE}/api/access/grant`, {
        recordIdHash: selectedRecord.recordIdHash,
        providerAddress: selectedProvider,
        recordId: selectedRecord.recordId,
        validUntil: 0,
        scope: null
      });
      logStatus("Access granted.");
    } catch (err) {
      console.error(err);
      logStatus("Failed to grant access.");
    }
  }

  async function handleRevokeAccess(e) {
    e.preventDefault();
    if (!selectedRecord || !selectedProvider) {
      logStatus("Select a record and a provider first.");
      return;
    }
    if (!selectedRecord.recordIdHash) {
      logStatus("Record has not been registered on-chain yet.");
      return;
    }

    try {
      logStatus("Revoking access...");
      await axios.post(`${API_BASE}/api/access/revoke`, {
        recordIdHash: selectedRecord.recordIdHash,
        providerAddress: selectedProvider
      });
      logStatus("Access revoked.");
    } catch (err) {
      console.error(err);
      logStatus("Failed to revoke access.");
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!searchValue.trim()) {
      logStatus("Enter a keyword to search");
      return;
    }
    logStatus(`Searching records for "${searchValue}" (demo)`);
  }

  function handleNotificationsClick() {
    setNotificationsOpen((open) => {
      const next = !open;
      if (next) {
        fetchNotifications({ silent: true });
        if (notifications.length === 0) {
          logStatus("No notifications");
        } else {
          logStatus("Notifications shown");
        }
      } else {
        logStatus("Notifications hidden");
      }
      return next;
    });
  }

  async function handleClearNotifications() {
    if (role === "PATIENT" || !address) {
      setNotifications([]);
      logStatus("Notifications cleared.");
      return;
    }

    try {
      await axios.post(
        `${API_BASE}/api/providers/${address}/notifications/clear`
      );
      setNotifications([]);
      logStatus("Notifications cleared.");
    } catch (err) {
      console.error(err);
      logStatus("Failed to clear notifications.");
    }
  }

  function toggleAdvancedLogs() {
    setShowAdvancedLogs((prev) => {
      const next = !prev;
      if (next) {
        fetchChainLogs({ silent: true });
        logStatus("Advanced logs enabled");
      } else {
        logStatus("Advanced logs hidden");
      }
      return next;
    });
  }

  function handleRoleChange(e) {
    const newRole = e.target.value;
    setRole(newRole);

    if (newRole === "PATIENT") {
      if (patientAddress) {
        setAddress(patientAddress);
        logStatus(`Switched to PATIENT at ${patientAddress}`);
      } else {
        logStatus("No patient address loaded yet.");
      }
      return;
    }

    const roleIndex = ROLES.indexOf(newRole);
    const providerIndex = roleIndex - 1;

    if (providerIndex < 0 || providerIndex >= providers.length) {
      logStatus("Provider address not available in Ganache.");
      return;
    }

    const addr = providers[providerIndex];
    setAddress(addr);
    logStatus(`Switched to ${newRole} at ${addr}`);
  }

  async function openRecordViewer(recordId) {
    try {
      logStatus("Loading record...");
      const res = await axios.get(`${API_BASE}/api/records/${recordId}`);
      setViewingRecord(res.data);
      logStatus("Record loaded.");
    } catch (err) {
      console.error(err);
      logStatus("Failed to load record");
    }
  }

  function getProviderLabel(addr) {
    if (!addr) return "Unknown provider";
    const idx = findProviderIndex(addr);
    const short =
      addr && addr.startsWith("0x")
        ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
        : addr;
    if (idx === -1) {
      return short;
    }
    const roleIndex = idx + 1;
    const name = ROLES[roleIndex] || "PROVIDER";
    return `${name} (${short})`;
  }

  function findProviderIndex(addr) {
    if (!addr) return -1;
    const target = addr.toLowerCase();
    return providers.findIndex((p) => (p || "").toLowerCase() === target);
  }

  function addressesEqual(a, b) {
    if (!a || !b) return false;
    return a.toLowerCase() === b.toLowerCase();
  }

  function getAccountFriendlyLabel(addr) {
    if (!addr) return "Unknown";
    const short = shortenMiddle(addr, 6, 4);
    if (patientAddress && addressesEqual(addr, patientAddress)) {
      return `PATIENT (${short})`;
    }
    const idx = findProviderIndex(addr);
    if (idx !== -1) {
      const roleIndex = idx + 1;
      const name = ROLES[roleIndex] || "PROVIDER";
      return `${name} (${short})`;
    }
    return short;
  }

  function shortenMiddle(str, front = 6, back = 4) {
    if (!str || str.length <= front + back + 3) return str;
    return `${str.slice(0, front)}...${str.slice(-back)}`;
  }

  function formatCid(cid) {
    return shortenMiddle(cid, 8, 6);
  }

  function formatHash(hash) {
    return shortenMiddle(hash, 6, 6);
  }

  function renderNotificationText(notif) {
    if (!notif) return "";
    if (notif.type === "record-shared") {
      const owner = notif.patientAddress
        ? getAccountFriendlyLabel(notif.patientAddress)
        : "A patient";
      const recordLabel = notif.recordId || formatHash(notif.recordIdHash);
      return `${owner} shared ${recordLabel}`;
    }
    return notif.message || "New activity";
  }

  function formatNotificationTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString();
    } catch (err) {
      console.error(err);
      return "";
    }
  }

  function formatDateTime(value) {
    if (!value) return "";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return date.toLocaleString();
    } catch (err) {
      console.error(err);
      return "";
    }
  }

  function renderStatusLogs() {
    if (statusLog.length === 0) {
      return <p className="muted">No log entries yet.</p>;
    }

    return (
      <ul className="console-log-list">
        {statusLog.map((entry) => (
          <li key={entry.id}>
            <span className="console-log-time">{entry.timestamp}</span>
            <span className="console-log-message">{entry.message}</span>
          </li>
        ))}
      </ul>
    );
  }

  function renderChainLogs() {
    if (chainLogsLoading && !chainLogs.length) {
      return <p className="muted">Loading chain logs...</p>;
    }

    if (!chainLogs.length) {
      return <p className="muted">No chain activity yet.</p>;
    }

    return (
      <ul className="console-log-list advanced">
        {chainLogs.map((log) => (
          <li key={log.id}>
            <span className="console-log-time">
              {formatDateTime(log.blockTime || log.timestamp)}
            </span>
            <div className="console-log-message">
              <strong>{log.label || "Chain interaction"}</strong>
              <div className="chain-log-lines">
                {log.txHash && (
                  <div>
                    <span className="chain-log-label">Transaction:</span>{" "}
                    <code>{log.txHash}</code>
                  </div>
                )}
                {log.gasUsed && (
                  <div>
                    <span className="chain-log-label">Gas usage:</span>{" "}
                    {log.gasUsed}
                  </div>
                )}
                {log.blockNumber !== null && log.blockNumber !== undefined && (
                  <div>
                    <span className="chain-log-label">Block number:</span>{" "}
                    {log.blockNumber}
                  </div>
                )}
                {log.blockTime && (
                  <div>
                    <span className="chain-log-label">Block time:</span>{" "}
                    {formatDateTime(log.blockTime)}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

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
        <div className="nav-list">
          <div className="nav-item active">
            <span className="nav-dot" />
            <span className="nav-label">Access</span>
          </div>
        </div>
        <div className="role-box">
          <label>View as</label>
          <select value={role} onChange={handleRoleChange}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>Access</span>
            <span className="crumb">›</span>
            <strong>{role === "PATIENT" ? "Patient Dashboard" : "Provider Dashboard"}</strong>
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
                    <button onClick={handleClearNotifications}>Clear all</button>
                  </header>
                  {notifications.length === 0 ? (
                    <p className="muted">No new alerts</p>
                  ) : (
                    <ul>
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <div>
                            <strong>{renderNotificationText(n)}</strong>
                            <span>{formatNotificationTime(n.timestamp)}</span>
                          </div>
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
                          logStatus("Signed in");
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
                        logStatus("Signed out");
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

        <section className="overview-grid">
          {role === "PATIENT" ? (
            <>
              <div className="card patient-card">
                <div className="patient-header">
                  <div className="patient-avatar blank-avatar" aria-hidden="true">
                    AC
                  </div>
                  <div>
                    <h2>Access Control</h2>
                    <p>
                      Patient: <code>{patientAddress || "Loading accounts..."}</code>
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
                          <th>View</th>
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
                            <td>
                              {r.cid ? (
                                <code title={r.cid}>{formatCid(r.cid)}</code>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {r.recordIdHash ? (
                                <code title={r.recordIdHash}>{formatHash(r.recordIdHash)}</code>
                              ) : (
                                "pending"
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ marginTop: 0, padding: "6px 10px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRecordViewer(r.recordId);
                                }}
                              >
                                View
                              </button>
                            </td>
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
                    <span>Provider</span>
                    <select
                      value={selectedProvider}
                      onChange={(e) => setSelectedProvider(e.target.value)}
                    >
                      <option value="">Select a provider</option>
                      {providers.map((p) => (
                        <option key={p} value={p}>
                          {getProviderLabel(p)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="actions">
                    <button type="submit" className="btn-primary">
                      Grant access
                    </button>
                    <button type="button" className="btn-primary" onClick={handleRevokeAccess}>
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
            </>
          ) : (
            <>
              <div className="card patient-card">
                <div className="patient-header">
                  <div className="patient-avatar blank-avatar" aria-hidden="true">
                    PR
                  </div>
                  <div>
                    <h2>Provider View</h2>
                    <p>
                      Role: {role} · Address: <code>{address || "N/A"}</code>
                    </p>
                  </div>
                </div>

                <div className="records-list">
                  <h3>Records shared with you</h3>
                  {providerRecords.length === 0 ? (
                    <p>No records have been shared with this provider yet.</p>
                  ) : (
                    <table className="simple-table">
                      <thead>
                        <tr>
                          <th>Record ID</th>
                          <th>Owner (patient)</th>
                          <th>On-chain ID</th>
                          <th>View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {providerRecords.map((r) => (
                          <tr key={r.recordId}>
                            <td>{r.recordId}</td>
                            <td>
                              <code title={r.owner}>{getAccountFriendlyLabel(r.owner)}</code>
                            </td>
                            <td>
                              {r.recordIdHash ? (
                                <code title={r.recordIdHash}>{formatHash(r.recordIdHash)}</code>
                              ) : (
                                "n/a"
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ marginTop: 0, padding: "6px 10px" }}
                                onClick={() => openRecordViewer(r.recordId)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
            </>
          )}
        </section>

        <footer className="console-footer">
          <div className="console-footer-header">
            <strong>{showAdvancedLogs ? "Chain console" : "Console log"}</strong>
            <div className="console-footer-controls">
              <span>
                {role} · {address ? shortenMiddle(address, 6, 4) : "No wallet"}
              </span>
              <label className="advanced-toggle">
                <input
                  type="checkbox"
                  checked={showAdvancedLogs}
                  onChange={toggleAdvancedLogs}
                />
                <span>Advanced logs</span>
              </label>
            </div>
          </div>
          {showAdvancedLogs ? renderChainLogs() : renderStatusLogs()}
        </footer>
      </div>

      {viewingRecord && (
        <FileViewerModal record={viewingRecord} onClose={() => setViewingRecord(null)} />
      )}
    </div>
  );
}
