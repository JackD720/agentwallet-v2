import { useState, useEffect } from "react";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

const defaultSuppliers = [
  { name: "Hershey's", email: "orders@hersheys.com", product: "Chocolate chips", price: "4.20" },
  { name: "ePac", email: "orders@epacflexibles.com", product: "Packaging bags", price: "0.45" },
  { name: "Boston Baking", email: "production@bostonbaking.com", product: "Co-packing", price: "2.10" },
];

function getSuppliers() {
  try {
    const saved = localStorage.getItem("bytem_suppliers");
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultSuppliers;
}

const defaultInventory = {
  "BTM-CHOC-2PK": { cases_on_hand: 0 },
  "BTM-BLND-2PK": { cases_on_hand: 0 },
  "BTM-RB-2PK": { cases_on_hand: 0 },
};

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

function InventoryBar({ item }) {
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
  const [showPOInput, setShowPOInput] = useState(false);
  const [poText, setPoText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState(null);
  const [yourName] = useState(() => {
    try { return localStorage.getItem("bytem_yourName") || "Jack"; } catch { return "Jack"; }
  });

  const [parsedPO, setParsedPO] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [draftedEmails, setDraftedEmails] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  const [sendingEmails, setSendingEmails] = useState([]);
  const [mismatches, setMismatches] = useState([]);
  const [totalVol, setTotalVol] = useState(128400);

  function detectMismatches(poItems) {
    const warnings = [];
    try {
      const recipes = JSON.parse(localStorage.getItem("bytem_recipes") || "[]");
      if (!recipes.length) return [];

      poItems.forEach(item => {
        const name = (item.product_name || "").toUpperCase();

        // Extract oz from PO product name e.g. "10/4.7 OZ" or "6/4.23OZ"
        const ozMatch = name.match(/(\d+\.?\d*)\s*OZ/);
        const packMatch = name.match(/^(\d+)\//);
        const poOz = ozMatch ? parseFloat(ozMatch[1]) : null;
        const poPack = packMatch ? parseInt(packMatch[1]) : null;

        // Find matching recipe by SKU or name
        const recipe = recipes.find(r =>
          name.includes(r.sku?.toUpperCase()) ||
          name.includes(r.name?.toUpperCase().split(" ").slice(-1)[0]) // last word e.g. "CLASSIC"
        );

        if (recipe) {
          const settingsOz = parseFloat(recipe.unitSize) || null;
          const settingsPack = recipe.unitsPerCase || null;

          if (poOz && settingsOz && Math.abs(poOz - settingsOz) > 0.05) {
            warnings.push({
              sku: item.sku || recipe.sku,
              type: "unit_size",
              po: `${poPack ? poPack + "/" : ""}${poOz} oz`,
              settings: `${settingsPack}/${settingsOz} oz`,
              message: `PO shows ${poOz} oz but your recipe has ${settingsOz} oz`
            });
          } else if (poPack && settingsPack && poPack !== settingsPack) {
            warnings.push({
              sku: item.sku || recipe.sku,
              type: "case_pack",
              po: `${poPack}-pack`,
              settings: `${settingsPack}-pack`,
              message: `PO shows ${poPack} units/case but your recipe has ${settingsPack}`
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

      setLoadingStep("Checking inventory...");
      const invRes = await fetch("/api/check-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedPO: poData.data, inventory: defaultInventory }),
      });
      const invData = await invRes.json();
      if (!invData.success) throw new Error(invData.error);
      setInventoryReport(invData.data);
      try { localStorage.setItem("bytem_lastPoCases", invData.data.total_cases_to_produce); } catch {}

      setLoadingStep("Drafting supplier emails...");
      const suppliers = getSuppliers();
      const emailRes = await fetch("/api/draft-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryReport: invData.data,
          suppliers,
          brandName: localStorage.getItem("bytem_companyName") || "BYTE'M Brownies",
          yourName,
        }),
      });
      const emailData = await emailRes.json();
      if (!emailData.success) throw new Error(emailData.error);
      setDraftedEmails(emailData.data);

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
          fromName: yourName,
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
                    placeholder={`Paste your full PO email here...`}
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

        {/* Mismatch warning banner */}
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
                <div style={cardHeadStyle}><CardLabel>Inventory check</CardLabel><Tag>auto-calculated</Tag></div>
                <div style={{ padding: "16px 18px" }}>
                  {inventoryReport.line_items.map((item, i) => <InventoryBar key={i} item={item} />)}
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
                        onClick={() => !sentEmails.includes(email.to) && !sendingEmails.includes(email.to) && handleSend(email)}
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
                  {inventoryReport.line_items.map((item, i) => {
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
                  })}
                  <div style={{ margin: "12px 0", padding: "10px 12px", background: "#f8f8f8", borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: "#ccc", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Rules enforced</div>
                    <div style={{ fontSize: 12, color: "#999" }}>Max $10K per transaction · $25K monthly per supplier · approval above $5K</div>
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
    </div>
  );
}
