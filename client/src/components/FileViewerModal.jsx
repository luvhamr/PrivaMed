// src/components/FileViewerModal.jsx
import React, { useMemo, useEffect } from "react";

function b64toBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime || "application/octet-stream" });
}

export default function FileViewerModal({ record, onClose }) {
  if (!record || !record.payload) return null;

  const { payload, recordId } = record;

  // Build a Blob URL to use in iframe/img/download/open-in-new-tab
  const fileUrl = useMemo(() => {
    if (payload.kind !== "file" || !payload.base64) return null;
    try {
      const blob = b64toBlob(payload.base64, payload.mimeType);
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [payload]);

  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  let contentElement = null;

  if (payload.kind === "file") {
    if (fileUrl) {
      if ((payload.mimeType || "").includes("pdf")) {
        contentElement = (
          <iframe
            src={fileUrl}
            title={payload.fileName || "PDF Document"}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        );
      } else if ((payload.mimeType || "").startsWith("image/")) {
        contentElement = (
          <img
            src={fileUrl}
            alt={payload.fileName || "Image"}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              margin: "0 auto"
            }}
          />
        );
      } else {
        contentElement = (
          <iframe
            src={fileUrl}
            title={payload.fileName || "File Preview"}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        );
      }
    } else {
      contentElement = <p>Unable to generate a preview for this file.</p>;
    }
  } else if (payload.kind === "note") {
    contentElement = (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          margin: 0
        }}
      >
        {payload.text}
      </pre>
    );
  } else {
    contentElement = <p>Unsupported record type.</p>;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-fullscreen">
        <header className="modal-header">
          <div className="modal-title">
            <h2>
              Record: <code>{recordId}</code>
            </h2>
            {payload.kind === "file" && payload.fileName && (
              <p>
                File: <strong>{payload.fileName}</strong>{" "}
                {payload.mimeType && <span>({payload.mimeType})</span>}
              </p>
            )}
          </div>
          <div className="modal-header-actions">
            {payload.kind === "file" && fileUrl && (
              <>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline"
                >
                  Open in new tab
                </a>
                <a
                  href={fileUrl}
                  download={payload.fileName || "record-file"}
                  className="btn-primary"
                >
                  Download
                </a>
              </>
            )}
            <button className="close-btn" type="button" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        <div className="modal-body">
          {contentElement}
        </div>

        {payload.kind === "file" && payload.note && (
          <footer className="modal-footer">
            <div className="attached-note">
              <strong>Attached note:</strong>
              <div className="attached-note-text">{payload.note}</div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
