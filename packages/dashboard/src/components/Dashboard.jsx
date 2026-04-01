// src/components/Dashboard.jsx
// Session 2: reads settings from Supabase via SettingsContext instead of raw localStorage.
// All localStorage.getItem() calls replaced with context getters.

import { useState, useEffect } from "react";
import { useSettings } from "../context/SettingsContext";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

function PayIcon({ status }) {
  const cfg = {
    approved: { bg: ACCENT_BG, border: ACCENT_BORDER, symbol: "✓", color: "#0a7a9a" },
    pending: { bg: "#fff8ed", border: "#fde8b0", symbol: "!", color: "#92580a" },
    blocked: { bg: "#fff0f0", border: "#ffd5d5", symbol: "✕", color: "#c0392b" },
  };
  const c = cfg[status] || cfg.approved;
  return (
    <div style={{ width: 30, height: 30, borderRadius: "50%", background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, fontWeight: 700, color: c.color }}>
      {c.symbol}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    approved: { bg: ACCENT_BG, border: ACCENT_BORDER, color: "#0a7a9a", label: "auto-approved" },
    pending: { bg: "#fff8ed", border: "#fde8b0", color: "#92580a", label: "needs approval" },
    blocked: { bg: "#fff0f0", border: "#ffd5d5", color: "#c0392b", label: "blocked" },
  };
  const c = cfg[status] || cfg.approved;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {c.label}
    </span>
  );
}

function InventoryBar({ item, mode }) {
  if (mode === "ingredient") {
    const pct = item.needed > 0 ? Math.round((item.on_hand / item.needed) * 100) : 0;
    const barColor = item.status === "sufficient" ? "#2ecc71" : pct < 25 ? "#ff4d4d" : "#f59e0b";
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.ingredient_name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
            background: item.status === "sufficient" ? "#f0fff4" : "#fff8ed",
            border: `1px solid ${item.status === "sufficient" ? "#bbf7d0" : "#fde8b0"}`,
            color: item.status === "sufficient" ? "#166534" : "#92580a" }}>
            {item.status === "sufficient" ? "sufficient" : `order ${item.gap.toFixed(1)} ${item.unit}`}
          </span>
        </div>
        <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 2, transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#bbb" }}>
          <span>{item.on_hand.toFixed(1)} {item.unit} on hand</span>
          <span>{item.needed.toFixed(1)} {item.unit} needed</span>
        </div>
        {item.cost_to_order > 0 && (
          <div style={{ fontSize: 11, color: "#0a7a9a", marginTop: 3 }}>
            Est. cost to order gap: <strong>${item.cost_to_order.toFixed(2)}</strong>
          </div>
        )}
      </div>
    );
  }

  const pct = item.cases_ordered > 0 ? Math.round((item.cases_on_hand / item.cases_ordered) * 100) : 0;
  const barColor = pct < 25 ? "#ff4d4d" : ACCENT;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.product_name}</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "#fff8ed", border: "1px solid #fde8b0", color: "#92580a" }}>
          produce {item.cases_to_produce}
        </span>
      </div>
      <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 2, transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#bbb" }}>
        <span>{item.cases_on_hand} on hand</span>
        <span>{item.cases_ordered} needed</span>
      </div>
    </div>
  );
}

const cardStyle = { background: "#fff", border: "1px solid #ebebeb", borderRadius: 14, overflow: "hidden" };
const cardHeadStyle = { padding: "13px 18px", borderBottom: "1px solid #ebebeb", display: "flex", alignItems: "center", justifyContent: "space-between" };

function CardLabel({ children }) {
  return <span style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.1em" }}>{children}</span>;
}

function Tag({ children, accent }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 8, background: accent ? ACCENT_BG : "#f8f8f8", border: `1px solid ${accent ? ACCENT_BORDER : "#ebebeb"}`, color: accent ? "#0a7a9a" : "#bbb" }}>
      {children}
    </span>
  );
}

export default function Dashboard() {
  // -----------------------------------------------------------------------
  // Pull everything from Supabase context instead of raw localStorage
  // -----------------------------------------------------------------------
  const { settings, saveSettings, yourName, companyName, sheetsUrl, suppliers, recipes } = useSettings();

  const [showPOInput, setShowPOInput] = useState(false);
  const [poText, setPoText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState(null);

  const [parsedPO, setParsedPO] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [draftedEmails, setDraftedEmails] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  const [sendingEmails, setSendingEmails] = useState([]);
  const [confirmEmail, setConfirmEmail] = useState(null);
  const [mismatches, setMismatches] = useState([]);
  const [totalVol, setTotalVol] = useState(128400);

  function detectMismatches(poItems) {
    const warnings = [];
    try {
      if (!recipes?.length) return [];

      poItems.forEach(item => {
        const name = (item.product_name || "").toUpperCase();
        const ozMatch = name.match(/(\d+\.?\d*)\s*OZ/);
        const packMatch = name.match(/^(\d+)\//);
        const poOz = ozMatch ? parseFloat(ozMatch[1]) : null;
        const poPack = packMatch ? parseInt(packMatch[1]) : null;

        const recipe = recipes.find(r =>
          name.includes(r.sku?.toUpperCase()) ||
          name.includes(r.name?.toUpperCase().split(" ").slice(-1)[0])
        );

        if (recipe) {
          const settingsOz = parseFloat(recipe.unitSize) || null;
          const settingsPack = recipe.unitsPerCase || null;
          const ozDiffers = poOz && settingsOz && Math.abs(poOz - settingsOz) > 0.5;
          const packDiffers = poPack && settingsPack && poPack !== settingsPack;

          if (ozDiffers && packDiffers) {
            warnings.push({
              sku: item.sku || recipe.sku,
              type: "format_change",
              po: `${poPack}/${poOz} oz`,
              settings: `${settingsPack}/${settingsOz} oz`,
              message: `PO format ${poPack}/${poOz}oz doesn't match your recipe ${settingsPack}/${settingsOz}oz`
            });
          } else if (ozDiffers && !poPack) {
            warnings.push({
              sku: item.sku || recipe.sku,
              type: "unit_size",
              po: `${poOz} oz`,
              settings: `${settingsOz} oz`,
              message: `PO shows ${poOz} oz but your recipe has ${settingsOz} oz`
            });
          }
        }
      });
    } catch {}
    return warnings;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setTotalVol(v => v + Math.floor(Math.random() * 500 + 200));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  async function runAutomation() {
    if (!poText.trim()) return;
    setLoading(true);
    setError(null);
    setParsedPO(null);
    setInventoryReport(null);
    setDraftedEmails([]);
    setMismatches([]);

    try {
      setLoadingStep("Reading PO email...");
      const poRes = await fetch("/api/parse-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailContent: poText }),
      });
      const poData = await poRes.json();
      if (!poData.success) throw new Error(poData.error);
      setParsedPO(poData.data);
      setMismatches(detectMismatches(poData.data.items || []));

      setLoadingStep("Fetching ingredient inventory...");
      let ingredientInventory = {};
      try {
        // Use sheetsUrl from context (Supabase) instead of raw localStorage
        const activeSheetUrl = sheetsUrl || settings?.sheets_url;
        const activeRecipes = recipes?.length ? recipes : [];

        if (activeSheetUrl && activeSheetUrl.includes("docs.google.com")) {
          const sheetRes = await fetch("/api/fetch-inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sheetUrl: activeSheetUrl }),
          });
          const sheetData = await sheetRes.json();
          if (sheetData.success) ingredientInventory = sheetData.data;
        }

        setLoadingStep("Calculating ingredient gaps...");
        const invRes = await fetch("/api/check-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parsedPO: poData.data, inventory: ingredientInventory, recipes: activeRecipes }),
        });
        const invData = await invRes.json();
        if (!invData.success) throw new Error(invData.error);
        setInventoryReport(invData.data);

        // Persist lastPoCases to Supabase
        if (invData.data.total_cases_to_produce) {
          saveSettings({ last_po_cases: invData.data.total_cases_to_produce });
        }

        setLoadingStep("Drafting supplier emails...");
        const activeSuppliers = suppliers?.length ? suppliers : [];
        const emailRes = await fetch("/api/draft-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryReport: invData.data,
            suppliers: activeSuppliers,
            brandName: companyName || "BYTE'M Brownies",
            yourName: yourName || "Jack",
          }),
        });
        const emailData = await emailRes.json();
        if (!emailData.success) throw new Error(emailData.error);
        setDraftedEmails(emailData.data);
      } catch (innerErr) {
        // If inventory/email step fails, still show the parsed PO
        console.error("Inventory/email step:", innerErr);
        throw innerErr;
      }

      setShowPOInput(false);
      setPoText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleSend(email) {
    setSendingEmails(prev => [...prev, email.to]);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.email,
          toName: email.to,
          subject: email.subject,
          body: email.body,
          fromName: yourName || "Jack",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSentEmails(prev => [...prev, email.to]);
      } else {
        alert("Send failed: " + data.error);
      }
    } catch (err) {
      alert("Send failed: " + err.message);
    } finally {
      setSendingEmails(prev => prev.filter(n => n !== email.to));
    }
  }

  const hasData = parsedPO && inventoryReport;
  const totalCasesToProduce = inventoryReport?.total_cases_to_produce || 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'DM Mono', 'Fira Code', monospace", color: DARK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .send-btn:hover { opacity: 0.85; }
        textarea:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 18px", borderBottom: "1px solid #ebebeb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: DARK }}>B</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", color: DARK }}>byte'm ops</div>
              <div style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.08em", textTransform: "uppercase" }}>powered by AgentWallet</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="#settings" style={{ fontSize: 11, color: "#bbb", textDecoration: "none", fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", padding: "6px 14px", borderRadius: 20, border: "1px solid #ebebeb", background: "#fff" }}>⚙ settings</a>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #ebebeb", padding: "6px 14px", borderRadius: 20, fontSize: 11, color: "#888" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2ecc71", animation: "pulse 2s ease-in-out infinite" }} />
              automation active
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, margin: "22px 0", background: "#ebebeb", borderRadius: 14, overflow: "hidden" }}>
          {[
            { label: "Total Volume", value: `$${(totalVol / 1000).toFixed(1)}K`, sub: "↑ 12.4% today", accent: true },
            { label: "Active POs", value: hasData ? "1" : "0", sub: hasData ? parsedPO.retailer : "no active POs", accent: false },
            { label: "Cases to produce", value: hasData ? totalCasesToProduce.toString() : "—", sub: hasData ? "from latest PO" : "paste a PO to start", accent: false },
            { label: "Emails drafted", value: draftedEmails.length.toString(), sub: draftedEmails.length > 0 ? "ready to send" : "run automation first", accent: false },
          ].map((s, i) => (
            <div key={i} style={{ padding: "18px 22px", background: "#ffffff", borderTop: `3px solid ${s.accent ? ACCENT : "transparent"}` }}>
              <div style={{ fontSize: 10, color: "#bbb", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: DARK, letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* PO Input */}
        {!hasData && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: "18px 22px" }}>
              {!showPOInput ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DARK, marginBottom: 3 }}>Paste a purchase order to get started</div>
                    <div style={{ fontSize: 12, color: "#bbb" }}>Paste any PO email and the agent will handle everything automatically</div>
                  </div>
                  <button onClick={() => setShowPOInput(true)} style={{ padding: "10px 20px", background: ACCENT, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, color: DARK, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>
                    + paste PO
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 10 }}>Paste your PO email below</div>
                  <textarea
                    value={poText}
                    onChange={e => setPoText(e.target.value)}
                    placeholder="Paste your full PO email here..."
                    style={{ width: "100%", height: 160, padding: "12px 14px", border: "1px solid #ebebeb", borderRadius: 9, fontSize: 12, fontFamily: "'DM Mono', monospace", color: DARK, background: "#fafafa", resize: "vertical", lineHeight: 1.6 }}
                  />
                  {error && <div style={{ marginTop: 8, fontSize: 12, color: "#c0392b" }}>Error: {error}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => { setShowPOInput(false); setPoText(""); setError(null); }} style={{ padding: "8px 16px", background: "#fff", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#888" }}>cancel</button>
                    <button onClick={runAutomation} disabled={loading || !poText.trim()} style={{ padding: "8px 20px", background: loading ? "#ddd" : ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, color: loading ? "#999" : DARK, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      {loading ? (
                        <>
                          <div style={{ width: 12, height: 12, border: "2px solid #999", borderTopColor: DARK, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          {loadingStep || "processing..."}
                        </>
                      ) : "run automation →"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mismatch warning */}
        {hasData && mismatches.length > 0 && (
          <div style={{ marginBottom: 12, padding: "14px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>⚠️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>PO format mismatch detected</div>
              {mismatches.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: "#b45309", marginBottom: 2 }}>
                  <span style={{ fontFamily: "monospace", background: "#fef3c7", padding: "1px 5px", borderRadius: 4, marginRight: 6 }}>{m.sku}</span>
                  {m.message} — PO: <strong>{m.po}</strong> vs settings: <strong>{m.settings}</strong>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 6, opacity: 0.8 }}>
                Verify quantities before approving supplier emails. Update your recipe settings if your case pack or size has changed.
              </div>
            </div>
            <button onClick={() => setMismatches([])} style={{ fontSize: 12, color: "#b45309", background: "none", border: "none", cursor: "pointer", flexShrink: 0, opacity: 0.6 }}>✕</button>
          </div>
        )}

        {/* Main content */}
        {hasData && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={cardStyle}>
                <div style={cardHeadStyle}>
                  <CardLabel>Incoming PO</CardLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag accent>{parsedPO.delivery_date ? `Delivery ${parsedPO.delivery_date}` : "no delivery date"}</Tag>
                    <button onClick={() => { setParsedPO(null); setInventoryReport(null); setDraftedEmails([]); setShowPOInput(true); }} style={{ fontSize: 10, color: "#bbb", background: "none", border: "none", cursor: "pointer" }}>clear</button>
                  </div>
                </div>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 4 }}>{parsedPO.po_number}</div>
                  <div style={{ fontSize: 12, color: "#bbb", marginBottom: 16 }}>{parsedPO.retailer} · processed just now</div>
                  {parsedPO.items.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < parsedPO.items.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.product_name}</div>
                        <div style={{ fontSize: 10, color: "#ccc", fontFamily: "monospace", marginTop: 2 }}>{item.sku}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.cases} cases</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={cardHeadStyle}>
                  <CardLabel>Ingredient inventory</CardLabel>
                  <Tag>{inventoryReport.mode === "ingredient" ? "from google sheets" : "auto-calculated"}</Tag>
                </div>
                <div style={{ padding: "16px 18px" }}>
                  {inventoryReport.line_items.map((item, i) => (
                    <InventoryBar key={i} item={item} mode={inventoryReport.mode} />
                  ))}
                  {inventoryReport.mode === "ingredient" && inventoryReport.total_cost > 0 && (
                    <div style={{ padding: "10px 12px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, marginTop: 8 }}>
                      <div style={{ fontSize: 10, color: "#0a7a9a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Total estimated ingredient cost</div>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: DARK }}>${inventoryReport.total_cost.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={cardStyle}>
                <div style={cardHeadStyle}>
                  <CardLabel>Supplier emails drafted</CardLabel>
                  <Tag accent>{draftedEmails.length > 0 ? "ready to send" : "generating..."}</Tag>
                </div>
                <div style={{ padding: "0 18px" }}>
                  {draftedEmails.length === 0 ? (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "#ccc", fontSize: 12 }}>Generating emails...</div>
                  ) : draftedEmails.map((email, i) => (
                    <div key={i} style={{ padding: "13px 0", borderBottom: i < draftedEmails.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{email.to}</span>
                        <span style={{ fontSize: 11, color: "#bbb" }}>{email.qty}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{email.subject}</div>
                      <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {email.body?.split("\n").slice(1).join(" ").trim()}
                      </div>
                      <button
                        className="send-btn"
                        onClick={() => !sentEmails.includes(email.to) && !sendingEmails.includes(email.to) && setConfirmEmail(email)}
                        style={{ marginTop: 8, fontSize: 11, fontWeight: 500, color: sentEmails.includes(email.to) ? "#0a7a9a" : DARK, background: sentEmails.includes(email.to) ? ACCENT_BG : ACCENT, border: `1px solid ${sentEmails.includes(email.to) ? ACCENT_BORDER : ACCENT}`, padding: "4px 12px", borderRadius: 6, cursor: sentEmails.includes(email.to) ? "default" : "pointer", transition: "opacity 0.2s" }}>
                        {sentEmails.includes(email.to) ? "✓ sent" : sendingEmails.includes(email.to) ? "sending..." : "approve + send"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={cardHeadStyle}><CardLabel>Payment governance</CardLabel><Tag>AgentWallet</Tag></div>
                <div style={{ padding: "0 18px" }}>
                  {inventoryReport.mode === "ingredient" ? (
                    inventoryReport.line_items.filter(i => i.gap > 0).map((item, i, arr) => {
                      const amount = item.cost_to_order;
                      const threshold = parseFloat(settings?.approval_threshold) || 5000;
                      const maxTxn = parseFloat(settings?.max_per_txn) || 10000;
                      const status = amount > maxTxn ? "blocked" : amount > threshold ? "pending" : "approved";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                          <PayIcon status={status} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.ingredient_name}</div>
                            <div style={{ fontSize: 11, color: "#bbb" }}>{item.gap.toFixed(1)} {item.unit} to order @ ${item.price_per_lb}/lb</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: DARK, marginBottom: 4 }}>${amount.toLocaleString()}</div>
                            <StatusBadge status={status} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    inventoryReport.line_items.map((item, i) => {
                      const amount = item.cases_to_produce * 8;
                      const status = amount > 10000 ? "blocked" : amount > 5000 ? "pending" : "approved";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < inventoryReport.line_items.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                          <PayIcon status={status} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: DARK }}>{item.product_name}</div>
                            <div style={{ fontSize: 11, color: "#bbb" }}>{item.cases_to_produce} cases to produce</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: DARK, marginBottom: 4 }}>${amount.toLocaleString()}</div>
                            <StatusBadge status={status} />
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div style={{ margin: "12px 0", padding: "10px 12px", background: "#f8f8f8", borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: "#ccc", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Rules enforced</div>
                    <div style={{ fontSize: 12, color: "#999" }}>
                      Max ${settings?.max_per_txn || "10,000"} per transaction · ${settings?.max_monthly || "25,000"} monthly per supplier · approval above ${settings?.approval_threshold || "5,000"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => { setParsedPO(null); setInventoryReport(null); setDraftedEmails([]); setSentEmails([]); setMismatches([]); setShowPOInput(true); }}
              style={{ width: "100%", padding: 14, background: ACCENT, border: "none", borderRadius: 10, fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 800, color: DARK, cursor: "pointer" }}>
              + process another PO
            </button>
          </>
        )}

        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 10, color: "#ddd" }}>
          byte'm ops · powered by AgentWallet · arXiv:2501.10114
        </div>
      </div>

      {/* Send confirmation modal */}
      {confirmEmail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #ebebeb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: DARK }}>Confirm & Send</div>
                <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>Review before sending to {confirmEmail.to}</div>
              </div>
              <button onClick={() => setConfirmEmail(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>To</div>
              <div style={{ fontSize: 13, color: DARK, marginBottom: 12 }}>{confirmEmail.to} &lt;{confirmEmail.email}&gt;</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Subject</div>
              <div style={{ fontSize: 13, color: DARK, marginBottom: 12 }}>{confirmEmail.subject}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Message</div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto", fontFamily: "'DM Mono', monospace" }}>
                {confirmEmail.body?.split('\n').slice(1).join('\n').trim()}
              </div>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmEmail(null)} style={{ padding: "10px 20px", background: "#fff", border: "1px solid #ebebeb", borderRadius: 9, fontSize: 13, cursor: "pointer", color: "#888" }}>
                Cancel
              </button>
              <button onClick={() => { handleSend(confirmEmail); setConfirmEmail(null); }}
                style={{ padding: "10px 24px", background: ACCENT, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, color: DARK, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>
                ✓ Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
