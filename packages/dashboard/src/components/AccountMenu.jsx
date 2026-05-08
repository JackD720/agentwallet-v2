// src/components/AccountMenu.jsx
// Session 4: small dropdown showing the signed-in email + a sign-out option.
// Used in the Dashboard and Connections headers.

import { useState, useEffect } from "react";

const DARK = "#1a1a1a";

export default function AccountMenu({ email, onSignOut }) {
  const [open, setOpen] = useState(false);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!e.target.closest?.("[data-account-menu]")) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Two-letter avatar from the email's local part.
  const initials = (email || "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div data-account-menu style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={email || "Account"}
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: "1px solid #ebebeb",
          background: "#fafafa",
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          color: "#666",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#fff",
            border: "1px solid #ebebeb",
            borderRadius: 10,
            boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
            minWidth: 220,
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f5f5f5" }}>
            <div style={{
              fontSize: 10,
              color: "#bbb",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 2,
            }}>
              Signed in as
            </div>
            <div style={{ fontSize: 12, color: DARK, wordBreak: "break-all" }}>
              {email}
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); onSignOut?.(); }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 14px",
              background: "#fff",
              border: "none",
              fontFamily: "inherit",
              fontSize: 12,
              color: "#c0392b",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
