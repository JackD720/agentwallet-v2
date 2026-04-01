// src/components/Onboarding.jsx
// v2.5 — 5 steps: Welcome → Profile → Inventory (with column config) → Suppliers → Done

import { useState } from "react";
import { useSettings } from "../context/SettingsContext";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

export default function Onboarding() {
  const { registerUser } = useSettings();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 2 — Profile
  const [yourName, setYourName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  // Step 3 — Sheets
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [ingredientCol, setIngredientCol] = useState("B");
  const [priceCol, setPriceCol] = useState("C");
  const [inventoryCol, setInventoryCol] = useState("F");
  const [headerRow, setHeaderRow] = useState("4");

  // Step 4 — Suppliers
  const [suppliers, setSuppliers] = useState([]);
  const [newSupplier, setNewSupplier] = useState({ name: "", email: "", product: "", price: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  const steps = ["Welcome", "Profile", "Inventory", "Suppliers", "Done"];

  function addSupplier() {
    if (!newSupplier.name || !newSupplier.email) return;
    setSuppliers(prev => [...prev, { ...newSupplier, id: Date.now() }]);
    setNewSupplier({ name: "", email: "", product: "", price: "" });
    setShowAddForm(false);
  }

  function removeSupplier(id) {
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }

  async function handleFinish() {
    setLoading(true);
    setError(null);
    try {
      await registerUser(email.trim().toLowerCase(), {
        your_name: yourName.trim(),
        company_name: companyName.trim(),
        sheets_url: sheetsUrl.trim(),
        sheets_connected: sheetsUrl.trim().includes("docs.google.com"),
        ingredient_col: ingredientCol.trim().toUpperCase() || "B",
        price_col: priceCol.trim().toUpperCase() || "C",
        inventory_col: inventoryCol.trim().toUpperCase() || "F",
        header_row: headerRow.trim() || "4",
        suppliers,
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'DM Mono', 'Fira Code', monospace", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, select:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>

      <div style={{ maxWidth: 560, width: "100%" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: DARK }}>B</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: DARK }}>byte'm ops</div>
            <div style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.08em", textTransform: "uppercase" }}>powered by AgentWallet</div>
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, alignItems: "center" }}>
          {steps.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, flex: n < steps.length ? 1 : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? "#2ecc71" : active ? ACCENT : "#ebebeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: done || active ? DARK : "#bbb", flexShrink: 0 }}>
                    {done ? "✓" : n}
                  </div>
                  <div style={{ fontSize: 8, color: active ? DARK : "#ccc", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
                </div>
                {n < steps.length && <div style={{ flex: 1, height: 1, background: done ? "#2ecc71" : "#ebebeb", marginBottom: 14 }} />}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 16, overflow: "hidden" }}>

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 8 }}>Let's get you set up.</div>
              <div style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 24 }}>
                byte'm ops automates your CPG operations — reads POs, checks ingredient inventory, drafts supplier emails, and governs payments. Setup takes about 2 minutes.
              </div>
              {[
                ["📋", "Paste any PO email → AI parses it instantly"],
                ["📊", "Connect Google Sheets → live ingredient inventory"],
                ["✉️", "Agent drafts supplier emails with exact quantities"],
                ["🏦", "AgentWallet governs every payment automatically"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", marginBottom: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
              <button onClick={() => setStep(2)} style={primaryBtn}>Get started →</button>
            </div>
          )}

          {/* ── Step 2: Profile ── */}
          {step === 2 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 6 }}>Your profile</div>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 24 }}>Used to sign supplier emails and identify your account</div>

              <Field label="Your name" placeholder="Jack Davis" value={yourName} onChange={setYourName} />
              <Field label="Company name" placeholder="BYTE'M Brownies" value={companyName} onChange={setCompanyName} />
              <Field label="Your email" placeholder="jack@bytem.com" value={email} onChange={setEmail} type="email" hint="Syncs your settings across all devices" />

              {yourName && email && (
                <div style={{ fontSize: 11, color: "#0a7a9a", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                  Emails will be signed: <strong>{yourName}{companyName ? `, ${companyName}` : ""}</strong>
                </div>
              )}

              {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>{error}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(1)} style={backBtn}>← back</button>
                <button onClick={() => {
                  if (!yourName.trim()) { setError("Name is required."); return; }
                  if (!email.trim() || !email.includes("@")) { setError("Valid email is required."); return; }
                  setError(null); setStep(3);
                }} style={primaryBtn}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 3: Inventory / Sheets ── */}
          {step === 3 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 6 }}>Ingredient inventory</div>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 20 }}>Connect your Google Sheet so the agent knows what you have on hand</div>

              <Field
                label="Google Sheets URL"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetsUrl}
                onChange={setSheetsUrl}
              />

              {/* Visual column guide */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                  Which columns does your sheet use?
                </div>

                {/* Mini sheet preview */}
                <div style={{ border: "1px solid #ebebeb", borderRadius: 8, overflow: "hidden", marginBottom: 14, fontSize: 11 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5, 1fr)", background: "#f8f8f8", borderBottom: "1px solid #ebebeb" }}>
                    <div style={{ padding: "6px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>#</div>
                    {["A", "B", "C", "D", "E", "F"].slice(0, 5).map(c => (
                      <div key={c} style={{ padding: "6px 8px", color: "#888", textAlign: "center", borderRight: "1px solid #ebebeb", fontWeight: 600 }}>{c}</div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5, 1fr)", borderBottom: "1px solid #ebebeb", background: "#fffbeb" }}>
                    <div style={{ padding: "5px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>4</div>
                    <div style={{ padding: "5px 8px", color: "#888", borderRight: "1px solid #ebebeb", fontStyle: "italic" }}>—</div>
                    <div style={{ padding: "5px 8px", color: "#0a7a9a", fontWeight: 700, borderRight: "1px solid #ebebeb" }}>Ingredient</div>
                    <div style={{ padding: "5px 8px", color: "#0a7a9a", fontWeight: 700, borderRight: "1px solid #ebebeb" }}>Price/lb</div>
                    <div style={{ padding: "5px 8px", color: "#888", borderRight: "1px solid #ebebeb" }}>Supplier</div>
                    <div style={{ padding: "5px 8px", color: "#888" }}>...</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5, 1fr)", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ padding: "5px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>5</div>
                    <div style={{ padding: "5px 8px", color: "#bbb", borderRight: "1px solid #ebebeb" }}>—</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>Choc Chips</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>$3.70</div>
                    <div style={{ padding: "5px 8px", color: "#bbb", borderRight: "1px solid #ebebeb" }}>Hershey's</div>
                    <div style={{ padding: "5px 8px", color: "#bbb" }}>...</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5, 1fr)" }}>
                    <div style={{ padding: "5px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>6</div>
                    <div style={{ padding: "5px 8px", color: "#bbb", borderRight: "1px solid #ebebeb" }}>—</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>Cane Sugar</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>$1.04</div>
                    <div style={{ padding: "5px 8px", color: "#bbb", borderRight: "1px solid #ebebeb" }}>Domino</div>
                    <div style={{ padding: "5px 8px", color: "#bbb" }}>...</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#bbb", marginBottom: 14, fontStyle: "italic" }}>↑ Your sheet probably looks something like this. Row 4 is headers, data starts row 5.</div>

                {/* Column inputs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10 }}>
                  <ColInput label="Ingredient name col" value={ingredientCol} onChange={setIngredientCol} hint="e.g. B" />
                  <ColInput label="Price per lb col" value={priceCol} onChange={setPriceCol} hint="e.g. C" />
                  <ColInput label="Inventory on hand col" value={inventoryCol} onChange={setInventoryCol} hint="e.g. F" />
                  <ColInput label="Header row #" value={headerRow} onChange={setHeaderRow} hint="e.g. 4" />
                </div>

                {/* Live preview of what we'll read */}
                {sheetsUrl.includes("docs.google.com") && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, fontSize: 11, color: "#0a7a9a" }}>
                    ✓ We'll read: <strong>column {ingredientCol.toUpperCase()}</strong> for ingredient names, <strong>column {priceCol.toUpperCase()}</strong> for price/lb, <strong>column {inventoryCol.toUpperCase()}</strong> for inventory — headers on row {headerRow}
                  </div>
                )}
              </div>

              <div style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#bbb", marginBottom: 20 }}>
                💡 You can skip and add this later in Settings → Connections. The dashboard still works with estimated inventory.
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(2)} style={backBtn}>← back</button>
                <button onClick={() => setStep(4)} style={{ ...backBtn, color: "#999" }}>skip for now</button>
                <button onClick={() => setStep(4)} style={primaryBtn}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 4: Suppliers ── */}
          {step === 4 && (
            <div style={{ padding: 32 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 6 }}>Your suppliers</div>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 20 }}>The agent uses this to draft and send ingredient orders. You can add more later.</div>

              {/* Existing suppliers */}
              {suppliers.length > 0 && (
                <div style={{ marginBottom: 16, border: "1px solid #ebebeb", borderRadius: 10, overflow: "hidden" }}>
                  {suppliers.map((s, i) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < suppliers.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#0a7a9a", flexShrink: 0 }}>
                        {s.name[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>{s.email}{s.product ? ` · ${s.product}` : ""}</div>
                      </div>
                      <button onClick={() => removeSupplier(s.id)} style={{ fontSize: 11, color: "#ff4d4d", background: "#fff0f0", border: "1px solid #ffd5d5", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add supplier form */}
              {showAddForm ? (
                <div style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0a7a9a", marginBottom: 12 }}>New supplier</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <Field label="Company name" placeholder="Hershey's" value={newSupplier.name} onChange={v => setNewSupplier(p => ({ ...p, name: v }))} />
                    <Field label="Email" placeholder="orders@hersheys.com" value={newSupplier.email} onChange={v => setNewSupplier(p => ({ ...p, email: v }))} />
                    <Field label="Product / ingredient" placeholder="Chocolate chips" value={newSupplier.product} onChange={v => setNewSupplier(p => ({ ...p, product: v }))} />
                    <Field label="Price per unit ($)" placeholder="4.20" value={newSupplier.price} onChange={v => setNewSupplier(p => ({ ...p, price: v }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowAddForm(false)} style={backBtn}>cancel</button>
                    <button onClick={addSupplier} disabled={!newSupplier.name || !newSupplier.email} style={{ ...primaryBtn, opacity: (!newSupplier.name || !newSupplier.email) ? 0.5 : 1 }}>add supplier</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)} style={{ width: "100%", padding: "12px 16px", background: "none", border: "1px dashed #ddd", borderRadius: 10, fontSize: 12, color: "#888", cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
                  + add supplier
                </button>
              )}

              {suppliers.length === 0 && !showAddForm && (
                <div style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#bbb", marginBottom: 16 }}>
                  💡 Skip for now and add suppliers in Settings → Suppliers. The agent will still draft emails — you'll just need to fill in the contacts manually.
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(3)} style={backBtn}>← back</button>
                <button onClick={() => setStep(5)} style={{ ...backBtn, color: "#999" }}>skip for now</button>
                <button onClick={() => setStep(5)} style={primaryBtn}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 5 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 8 }}>You're all set.</div>
              <div style={{ fontSize: 13, color: "#999", marginBottom: 12, lineHeight: 1.7 }}>
                Your settings sync across all devices. Paste your first PO to kick off the automation loop.
              </div>

              {/* Summary of what was configured */}
              <div style={{ textAlign: "left", background: "#f8f8f8", borderRadius: 10, padding: 16, marginBottom: 24 }}>
                {[
                  ["Profile", yourName ? `${yourName}${companyName ? `, ${companyName}` : ""}` : "—"],
                  ["Google Sheets", sheetsUrl ? `Connected (cols ${ingredientCol}/${priceCol}/${inventoryCol}, row ${headerRow})` : "Not connected — add later"],
                  ["Suppliers", suppliers.length > 0 ? `${suppliers.length} supplier${suppliers.length > 1 ? "s" : ""} added` : "None — add in Settings"],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #ebebeb" }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                    <span style={{ fontSize: 12, color: DARK }}>{val}</span>
                  </div>
                ))}
              </div>

              {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>{error}</div>}

              <button onClick={handleFinish} disabled={loading} style={{ ...primaryBtn, width: "100%", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
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

// ── Design primitives ──

function Field({ label, placeholder, value, onChange, type = "text", hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>}
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 13, color: DARK, fontFamily: "inherit", outline: "none", background: "#fafafa" }} />
      {hint && <div style={{ fontSize: 11, color: "#ccc", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ColInput({ label, value, onChange, hint }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase())}
        maxLength={2}
        placeholder={hint}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #ebebeb", borderRadius: 7, fontSize: 14, fontWeight: 700, color: DARK, fontFamily: "'DM Mono', monospace", textAlign: "center", background: "#fafafa", outline: "none" }}
      />
    </div>
  );
}

const primaryBtn = {
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

const backBtn = {
  padding: "11px 16px",
  background: "#fff",
  border: "1px solid #ebebeb",
  borderRadius: 9,
  fontSize: 12,
  cursor: "pointer",
  color: "#888",
  fontFamily: "inherit",
};
