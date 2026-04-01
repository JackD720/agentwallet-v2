// src/components/Onboarding.jsx
// Shows on first visit (no userEmail in localStorage).
// Collects name + company + email → calls registerUser() → drops into dashboard.

import { useState } from "react";
import { useSettings } from "../context/SettingsContext";

const ACCENT = "#59E2FD";
const DARK = "#1a1a1a";

export default function Onboarding() {
  const { registerUser } = useSettings();

  const [step, setStep] = useState(1); // 1 = welcome, 2 = profile form, 3 = sheets, 4 = done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [yourName, setYourName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [sheetsUrl, setSheetsUrl] = useState("");

  async function handleFinish() {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!yourName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await registerUser(email.trim().toLowerCase(), {
        your_name: yourName.trim(),
        company_name: companyName.trim(),
        sheets_url: sheetsUrl.trim(),
        sheets_connected: sheetsUrl.trim().includes("docs.google.com"),
      });
      // registerUser sets userEmail in context → App re-renders → Onboarding disappears
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const stepLabels = ["Welcome", "Profile", "Inventory", "Done"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f8f6",
      fontFamily: "'DM Mono', 'Fira Code', monospace",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>

      <div style={{ maxWidth: 520, width: "100%" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: DARK }}>B</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: DARK }}>byte'm ops</div>
            <div style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.08em", textTransform: "uppercase" }}>powered by AgentWallet</div>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: done ? "#2ecc71" : active ? ACCENT : "#ebebeb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: done || active ? DARK : "#bbb",
                  transition: "all 0.3s",
                }}>
                  {done ? "✓" : n}
                </div>
                <div style={{ fontSize: 9, color: active ? DARK : "#ccc", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 16, overflow: "hidden" }}>

          {/* Step 1 — Welcome */}
          {step === 1 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 8 }}>
                Let's get you set up.
              </div>
              <div style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 28 }}>
                byte'm ops automates your CPG operations — it reads purchase orders, checks your ingredient inventory, drafts supplier emails, and enforces payment governance.
                <br /><br />
                Setup takes about 2 minutes.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {[
                  ["📋", "Paste any PO email → AI parses it instantly"],
                  ["📊", "Connect Google Sheets → live ingredient inventory"],
                  ["✉️", "Agent drafts supplier emails with exact quantities"],
                  ["🏦", "AgentWallet governs every payment automatically"],
                ].map(([icon, text]) => (
                  <div key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(2)} style={btnStyle}>
                Get started →
              </button>
            </div>
          )}

          {/* Step 2 — Profile */}
          {step === 2 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 6 }}>Your profile</div>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 24 }}>Used to sign supplier emails and personalize agent actions</div>

              <FieldGroup>
                <Field label="Your name" placeholder="Jack Davis" value={yourName} onChange={setYourName} />
                <Field label="Company name" placeholder="BYTE'M Brownies" value={companyName} onChange={setCompanyName} />
                <Field
                  label="Your email"
                  placeholder="jack@bytem.com"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  hint="Used to identify your account across devices"
                />
              </FieldGroup>

              {yourName && email && (
                <div style={{ fontSize: 11, color: "#0a7a9a", background: "#f0fcff", border: "1px solid #c8f4fd", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                  Emails will be signed: <strong>{yourName}{companyName ? `, ${companyName}` : ""}</strong>
                </div>
              )}

              {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(1)} style={backBtnStyle}>← back</button>
                <button
                  onClick={() => {
                    if (!yourName.trim()) { setError("Name is required."); return; }
                    if (!email.trim() || !email.includes("@")) { setError("Valid email is required."); return; }
                    setError(null);
                    setStep(3);
                  }}
                  style={btnStyle}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Google Sheets */}
          {step === 3 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 6 }}>Ingredient inventory</div>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 24 }}>Connect your Google Sheet to pull live inventory on each PO run</div>

              <Field
                label="Google Sheets URL"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetsUrl}
                onChange={setSheetsUrl}
                hint="Your inventory sheet — needs columns for ingredient name, price/lb, supplier, and lbs on hand"
              />

              <div style={{ fontSize: 11, color: "#bbb", marginBottom: 24, padding: "10px 14px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", lineHeight: 1.6 }}>
                💡 You can skip this and connect it later in Settings → Connections. The dashboard still works — it'll just use estimated inventory.
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(2)} style={backBtnStyle}>← back</button>
                <button onClick={() => setStep(4)} style={{ ...backBtnStyle, color: "#999" }}>skip for now</button>
                <button onClick={() => setStep(4)} style={btnStyle}>Continue →</button>
              </div>
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 8 }}>You're all set.</div>
              <div style={{ fontSize: 13, color: "#999", marginBottom: 28, lineHeight: 1.7 }}>
                Your settings will sync across all your devices. Paste your first PO to kick off the automation loop.
              </div>

              {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>{error}</div>}

              <button
                onClick={handleFinish}
                disabled={loading}
                style={{ ...btnStyle, width: "100%", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Setting up your account..." : "Open dashboard →"}
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: "#ddd" }}>
          byte'm ops · powered by AgentWallet · arXiv:2501.10114
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini design primitives
// ---------------------------------------------------------------------------

function FieldGroup({ children }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>;
}

function Field({ label, placeholder, value, onChange, type = "text", hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 13, color: "#1a1a1a", fontFamily: "inherit", outline: "none", background: "#fafafa" }}
      />
      {hint && <div style={{ fontSize: 11, color: "#ccc", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const btnStyle = {
  flex: 1,
  padding: "11px 20px",
  background: ACCENT,
  border: "none",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 700,
  color: DARK,
  cursor: "pointer",
  fontFamily: "'Syne', sans-serif",
};

const backBtnStyle = {
  padding: "11px 16px",
  background: "#fff",
  border: "1px solid #ebebeb",
  borderRadius: 9,
  fontSize: 12,
  cursor: "pointer",
  color: "#888",
  fontFamily: "inherit",
};
