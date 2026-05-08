// src/components/Login.jsx
// Session 4: magic-link sign-in.
// Three states:
//   1. "enter email" — user types their email, hits send
//   2. "check your email" — link sent confirmation (with resend after 30s)
//   3. "verifying" — when arriving with #login?token=... in URL
//
// On successful verify, calls onAuthenticated(email) which the parent uses to
// stash the email in localStorage and route into the app.

import { useState, useEffect, useRef } from "react";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const DARK = "#1a1a1a";

function getTokenFromHash() {
  // Hash format: "#login?token=XXX"
  const h = window.location.hash || "";
  if (!h.startsWith("#login")) return null;
  const q = h.split("?")[1] || "";
  const params = new URLSearchParams(q);
  return params.get("token");
}

export default function Login({ onAuthenticated }) {
  const [view, setView] = useState("enter"); // "enter" | "sent" | "verifying" | "verify_error"
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const verifiedOnce = useRef(false);

  // ── On mount, check for ?token=... and auto-verify ──
  useEffect(() => {
    const token = getTokenFromHash();
    if (!token || verifiedOnce.current) return;
    verifiedOnce.current = true;

    setView("verifying");
    (async () => {
      try {
        const res = await fetch("/api/login-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!data.success || !data.email) {
          setVerifyError(data.error || "Could not verify this link");
          setView("verify_error");
          return;
        }
        // Clean the token out of the URL before handing off.
        window.history.replaceState(null, "", window.location.pathname);
        onAuthenticated(data.email);
        // Belt-and-suspenders: when the SAME user re-authenticates (e.g.
        // clicks a fresh magic link while already signed in), React bails
        // out of the identical state update and we'd be stuck on the
        // "verifying" view forever. Force a clean reload after a beat to
        // guarantee the app re-renders into the correct gate.
        setTimeout(() => {
          if (window.location.hash === "" || !window.location.hash.startsWith("#login")) {
            // Hash already cleared, but spinner still showing — hard reload.
            window.location.replace(window.location.pathname);
          }
        }, 250);
      } catch (err) {
        console.error("verify failed:", err);
        setVerifyError("Network error during verification");
        setView("verify_error");
      }
    })();
  }, [onAuthenticated]);

  // ── Resend cooldown ticker ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function requestLink(e) {
    e?.preventDefault?.();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/login-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't send the link. Try again.");
        setSubmitting(false);
        return;
      }
      setView("sent");
      setResendCooldown(30);
    } catch (err) {
      console.error("login-request failed:", err);
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function tryDifferentEmail() {
    setView("enter");
    setError(null);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f8f6",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
        input::placeholder { color: #ccc; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ maxWidth: 420, width: "100%" }}>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 28,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 16,
              color: DARK,
            }}
          >
            B
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 18,
                color: DARK,
              }}
            >
              byte'm ops
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#ccc",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              powered by AgentWallet
            </div>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #ebebeb",
            borderRadius: 16,
            padding: 32,
          }}
        >
          {view === "enter" && (
            <form onSubmit={requestLink}>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 22,
                  color: DARK,
                  marginBottom: 6,
                }}
              >
                Sign in or get started.
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#999",
                  lineHeight: 1.6,
                  marginBottom: 22,
                }}
              >
                Enter your email and we'll send you a one-tap sign-in link.
                No password needed.
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  marginBottom: 6,
                }}
              >
                Email
              </div>
              <input
                type="email"
                autoFocus
                placeholder="you@yourbrand.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "11px 13px",
                  border: "1px solid #ebebeb",
                  borderRadius: 9,
                  fontSize: 14,
                  color: DARK,
                  fontFamily: "inherit",
                  background: "#fafafa",
                  marginBottom: 14,
                }}
              />

              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#c0392b",
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  background: ACCENT,
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  color: DARK,
                  fontFamily: "'Syne', sans-serif",
                  cursor: submitting || !email.trim() ? "not-allowed" : "pointer",
                  opacity: submitting || !email.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? "Sending..." : "Send sign-in link →"}
              </button>

              <div
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  marginTop: 16,
                  lineHeight: 1.6,
                  textAlign: "center",
                }}
              >
                First time here? You'll go straight to setup after signing in.
              </div>
            </form>
          )}

          {view === "sent" && (
            <div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: ACCENT_BG,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  marginBottom: 16,
                }}
              >
                ✉️
              </div>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 20,
                  color: DARK,
                  marginBottom: 8,
                }}
              >
                Check your inbox.
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#777",
                  lineHeight: 1.7,
                  marginBottom: 18,
                }}
              >
                We sent a sign-in link to{" "}
                <strong style={{ color: DARK }}>{email}</strong>. Click it to
                continue. The link expires in 15 minutes.
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: 9,
                  padding: "10px 12px",
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                Don't see it? Check spam, or wait a minute — first email from a
                new sender sometimes takes a moment.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={requestLink}
                  disabled={resendCooldown > 0 || submitting}
                  style={{
                    flex: 1,
                    padding: "11px 16px",
                    background: "#fff",
                    border: "1px solid #ebebeb",
                    borderRadius: 9,
                    fontSize: 12,
                    color: resendCooldown > 0 ? "#bbb" : "#666",
                    fontFamily: "inherit",
                    cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : submitting
                      ? "Resending..."
                      : "Resend link"}
                </button>
                <button
                  onClick={tryDifferentEmail}
                  style={{
                    flex: 1,
                    padding: "11px 16px",
                    background: "#fff",
                    border: "1px solid #ebebeb",
                    borderRadius: 9,
                    fontSize: 12,
                    color: "#666",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  Different email
                </button>
              </div>
            </div>
          )}

          {view === "verifying" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  border: "2px solid #ebebeb",
                  borderTopColor: ACCENT,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  margin: "0 auto 14px",
                }}
              />
              <div style={{ fontSize: 12, color: "#888" }}>
                Signing you in…
              </div>
            </div>
          )}

          {view === "verify_error" && (
            <div>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 20,
                  color: DARK,
                  marginBottom: 8,
                }}
              >
                Couldn't sign you in.
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#777",
                  lineHeight: 1.7,
                  marginBottom: 18,
                }}
              >
                {verifyError ||
                  "That link didn't work — it may have expired or already been used."}
              </div>
              <button
                onClick={tryDifferentEmail}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  background: ACCENT,
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  color: DARK,
                  fontFamily: "'Syne', sans-serif",
                  cursor: "pointer",
                }}
              >
                Send a new link →
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 18,
            fontSize: 10,
            color: "#ddd",
          }}
        >
          byte'm ops · powered by AgentWallet · arXiv:2501.10114
        </div>
      </div>
    </div>
  );
}
