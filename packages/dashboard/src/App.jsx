// src/App.jsx
import { useState, useEffect } from "react";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import Dashboard from "./components/Dashboard";
import Connections from "./components/Connections";
import Onboarding from "./components/Onboarding";

const ACCENT = "#59E2FD";
const DARK = "#1a1a1a";

// Inner app — reads from context, renders correct screen
function AppInner() {
  const { userEmail, loading } = useSettings();
  const [page, setPage] = useState(window.location.hash === "#settings" ? "connections" : "dashboard");

  useEffect(() => {
    const handleHash = () => {
      setPage(window.location.hash === "#settings" ? "connections" : "dashboard");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // No session → show onboarding
  if (!userEmail) return <Onboarding />;

  // Session found but settings still loading from Supabase
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

  return page === "connections" ? <Connections /> : <Dashboard />;
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
