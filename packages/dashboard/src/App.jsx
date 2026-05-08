// src/App.jsx
// Session 4: three-way gate.
//   1. No active session  →  <Login />  (also handles #login?token=... callback)
//   2. Session, settings still loading  →  spinner
//   3. Session, no profile yet  →  <Onboarding />
//   4. Session + onboarded  →  <Dashboard /> or <Connections /> (hash-routed)
//
// Login itself owns the magic-link verification flow, but it needs a way to
// hand the verified email back. We pass setSession from context as the
// onAuthenticated callback.

import { useState, useEffect } from "react";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import Dashboard from "./components/Dashboard";
import Connections from "./components/Connections";
import Onboarding from "./components/Onboarding";
import Login from "./components/Login";

const ACCENT = "#59E2FD";
const DARK = "#1a1a1a";

function isLoginHash() {
  return (window.location.hash || "").startsWith("#login");
}

function AppInner() {
  const { userEmail, loading, onboarded, setSession } = useSettings();

  const [page, setPage] = useState(
    window.location.hash === "#settings" ? "connections" : "dashboard"
  );

  useEffect(() => {
    const handleHash = () => {
      // Don't let #login change app routing — Login owns that hash.
      if (isLoginHash()) return;
      setPage(window.location.hash === "#settings" ? "connections" : "dashboard");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // 1. Login screen — either no session, OR they arrived with a #login token
  //    (even if a stale session is in localStorage, the token wins).
  if (!userEmail || isLoginHash()) {
    return <Login onAuthenticated={setSession} />;
  }

  // 2. Session present, settings still loading from Supabase
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#f8f8f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono', monospace",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Syne:wght@800&display=swap'); @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: DARK, margin: "0 auto 16px" }}>B</div>
          <div style={{ width: 20, height: 20, border: "2px solid #ebebeb", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 11, color: "#bbb", letterSpacing: "0.06em" }}>Loading your settings...</div>
        </div>
      </div>
    );
  }

  // 3. Session present, but no profile yet → onboarding
  if (!onboarded) {
    return <Onboarding />;
  }

  // 4. Fully onboarded
  return page === "connections" ? <Connections /> : <Dashboard />;
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
