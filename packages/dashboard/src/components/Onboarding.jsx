// src/components/Onboarding.jsx
// v2.6 — 6 steps: Welcome → Profile → Inventory → Suppliers → Recipes → Done

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
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // Step 5 — Recipes / BOM
  const [recipes, setRecipes] = useState([
    { id: 1, sku: "BB-001", name: "Product 1", unitsPerCase: 10, unitSize: "4.7", unitType: "bag", ingredients: [] }
  ]);
  const [activeRecipe, setActiveRecipe] = useState(0);
  const [newIngredient, setNewIngredient] = useState({ name: "", qty: "", unit: "lbs" });
  const [showAddIngredient, setShowAddIngredient] = useState(false);

  const steps = ["Welcome", "Profile", "Inventory", "Suppliers", "Recipes", "Done"];

  // ── Supplier helpers ──
  function addSupplier() {
    if (!newSupplier.name || !newSupplier.email) return;
    setSuppliers(prev => [...prev, { ...newSupplier, id: Date.now() }]);
    setNewSupplier({ name: "", email: "", product: "", price: "" });
    setShowAddSupplier(false);
  }
  function removeSupplier(id) { setSuppliers(prev => prev.filter(s => s.id !== id)); }

  // ── Recipe helpers ──
  function addSku() {
    const n = recipes.length + 1;
    const updated = [...recipes, { id: Date.now(), sku: `BB-00${n}`, name: `Product ${n}`, unitsPerCase: 10, unitSize: "4.7", unitType: "bag", ingredients: [] }];
    setRecipes(updated);
    setActiveRecipe(updated.length - 1);
  }
  function removeSku(idx) {
    if (recipes.length <= 1) return;
    const updated = recipes.filter((_, i) => i !== idx);
    setRecipes(updated);
    setActiveRecipe(Math.max(0, idx - 1));
  }
  function updateRecipeField(idx, field, val) {
    setRecipes(prev => prev.map((r, i) => i !== idx ? r : { ...r, [field]: val }));
  }
  function addIngredient(idx) {
    if (!newIngredient.name || !newIngredient.qty) return;
    setRecipes(prev => prev.map((r, i) => i !== idx ? r : {
      ...r,
      ingredients: [...r.ingredients, { ...newIngredient, id: Date.now(), qtyPerUnit: parseFloat(newIngredient.qty) }]
    }));
    setNewIngredient({ name: "", qty: "", unit: "lbs" });
    setShowAddIngredient(false);
  }
  function removeIngredient(recipeIdx, ingId) {
    setRecipes(prev => prev.map((r, i) => i !== recipeIdx ? r : {
      ...r, ingredients: r.ingredients.filter(ing => ing.id !== ingId)
    }));
  }

  // ── Finish ──
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
        recipes,
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const totalIngredients = recipes.reduce((sum, r) => sum + r.ingredients.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'DM Mono', 'Fira Code', monospace", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, select:focus { outline: none; border-color: ${ACCENT} !important; }
        input::placeholder { color: #ccc; }
      `}</style>

      <div style={{ maxWidth: 600, width: "100%" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: DARK }}>B</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: DARK }}>byte'm ops</div>
            <div style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.08em", textTransform: "uppercase" }}>powered by AgentWallet</div>
          </div>
        </div>

        {/* Step bar */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 24 }}>
          {steps.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", flex: n < steps.length ? 1 : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? "#2ecc71" : active ? ACCENT : "#ebebeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: done || active ? DARK : "#bbb", flexShrink: 0, transition: "all 0.3s" }}>
                    {done ? "✓" : n}
                  </div>
                  <div style={{ fontSize: 8, color: active ? DARK : "#ccc", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
                </div>
                {n < steps.length && <div style={{ flex: 1, height: 1, background: done ? "#2ecc71" : "#ebebeb", margin: "0 4px", marginBottom: 14, transition: "background 0.3s" }} />}
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
                byte'm ops automates your CPG operations — reads POs, checks ingredient inventory, drafts supplier emails, and governs payments. Setup takes about 3 minutes.
              </div>
              {[
                ["📋", "Paste any PO email → AI parses it instantly"],
                ["📊", "Connect Google Sheets → live ingredient inventory"],
                ["✉️", "Agent drafts supplier emails with exact quantities"],
                ["🏦", "AgentWallet governs every payment automatically"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", marginBottom: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#666" }}>{text}</span>
                </div>
              ))}
              <button onClick={() => setStep(2)} style={{ ...primaryBtn, marginTop: 24, width: "100%" }}>Get started →</button>
            </div>
          )}

          {/* ── Step 2: Profile ── */}
          {step === 2 && (
            <div style={{ padding: 32 }}>
              <StepHeader title="Your profile" sub="Used to sign supplier emails and identify your account" />
              <Field label="Your name" placeholder="Jack Davis" value={yourName} onChange={setYourName} />
              <Field label="Company name" placeholder="BYTE'M Brownies" value={companyName} onChange={setCompanyName} />
              <Field label="Your email" placeholder="jack@bytem.com" value={email} onChange={setEmail} type="email" hint="Syncs your settings across all devices" />
              {yourName && email && (
                <div style={{ fontSize: 11, color: "#0a7a9a", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                  Emails will be signed: <strong>{yourName}{companyName ? `, ${companyName}` : ""}</strong>
                </div>
              )}
              {error && <ErrMsg msg={error} />}
              <NavRow
                onBack={() => setStep(1)}
                onNext={() => {
                  if (!yourName.trim()) { setError("Name is required."); return; }
                  if (!email.trim() || !email.includes("@")) { setError("Valid email is required."); return; }
                  setError(null); setStep(3);
                }}
              />
            </div>
          )}

          {/* ── Step 3: Inventory / Sheets ── */}
          {step === 3 && (
            <div style={{ padding: 32 }}>
              <StepHeader title="Ingredient inventory" sub="Connect your Google Sheet so the agent knows what you have on hand" />
              <Field label="Google Sheets URL" placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsUrl} onChange={setSheetsUrl} />

              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Which columns does your sheet use?</div>

              {/* Mini sheet preview */}
              <div style={{ border: "1px solid #ebebeb", borderRadius: 8, overflow: "hidden", marginBottom: 12, fontSize: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 1fr", background: "#f8f8f8", borderBottom: "1px solid #ebebeb" }}>
                  {["", "A", "B", "C", "D+"].map((c, i) => (
                    <div key={i} style={{ padding: "5px 8px", color: "#888", textAlign: "center", borderRight: i < 4 ? "1px solid #ebebeb" : "none", fontWeight: 600 }}>{c}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 1fr", background: "#fffbeb", borderBottom: "1px solid #ebebeb" }}>
                  <div style={{ padding: "5px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>4</div>
                  <div style={{ padding: "5px 8px", color: "#888", fontStyle: "italic", borderRight: "1px solid #ebebeb" }}>—</div>
                  <div style={{ padding: "5px 8px", color: "#0a7a9a", fontWeight: 700, borderRight: "1px solid #ebebeb" }}>Ingredient</div>
                  <div style={{ padding: "5px 8px", color: "#0a7a9a", fontWeight: 700, borderRight: "1px solid #ebebeb" }}>Price/lb</div>
                  <div style={{ padding: "5px 8px", color: "#888" }}>Supplier...</div>
                </div>
                {[["Choc Chips", "$3.70", "Hershey's"], ["Cane Sugar", "$1.04", "Domino"]].map(([ing, p, s], i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 1fr", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ padding: "5px 8px", color: "#bbb", textAlign: "center", borderRight: "1px solid #ebebeb" }}>{5 + i}</div>
                    <div style={{ padding: "5px 8px", color: "#bbb", borderRight: "1px solid #ebebeb" }}>—</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>{ing}</div>
                    <div style={{ padding: "5px 8px", color: DARK, borderRight: "1px solid #ebebeb" }}>{p}</div>
                    <div style={{ padding: "5px 8px", color: "#bbb" }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#bbb", marginBottom: 14, fontStyle: "italic" }}>↑ Match your actual sheet layout — column letters and header row number</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10, marginBottom: 14 }}>
                <ColInput label="Ingredient col" value={ingredientCol} onChange={setIngredientCol} />
                <ColInput label="Price/lb col" value={priceCol} onChange={setPriceCol} />
                <ColInput label="Inventory col" value={inventoryCol} onChange={setInventoryCol} />
                <ColInput label="Header row" value={headerRow} onChange={setHeaderRow} isNumber />
              </div>

              {sheetsUrl.includes("docs.google.com") && (
                <div style={{ padding: "9px 12px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, marginBottom: 14, fontSize: 11, color: "#0a7a9a" }}>
                  ✓ Reading col <strong>{ingredientCol}</strong> (ingredient) · col <strong>{priceCol}</strong> (price/lb) · col <strong>{inventoryCol}</strong> (on hand) · headers row <strong>{headerRow}</strong>
                </div>
              )}

              <div style={{ padding: "9px 14px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#bbb", marginBottom: 20 }}>
                💡 Skip and add later in Settings → Connections.
              </div>
              <NavRow onBack={() => setStep(2)} onSkip={() => setStep(4)} onNext={() => setStep(4)} />
            </div>
          )}

          {/* ── Step 4: Suppliers ── */}
          {step === 4 && (
            <div style={{ padding: 32 }}>
              <StepHeader title="Your suppliers" sub="The agent drafts and sends ingredient orders to these contacts" />

              {suppliers.length > 0 && (
                <div style={{ marginBottom: 14, border: "1px solid #ebebeb", borderRadius: 10, overflow: "hidden" }}>
                  {suppliers.map((s, i) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: i < suppliers.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#0a7a9a", flexShrink: 0 }}>{s.name[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>{s.email}{s.product ? ` · ${s.product}` : ""}</div>
                      </div>
                      <button onClick={() => removeSupplier(s.id)} style={removeBtnStyle}>remove</button>
                    </div>
                  ))}
                </div>
              )}

              {showAddSupplier ? (
                <div style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0a7a9a", marginBottom: 12 }}>New supplier</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Company" placeholder="Hershey's" value={newSupplier.name} onChange={v => setNewSupplier(p => ({ ...p, name: v }))} />
                    <Field label="Email" placeholder="orders@hersheys.com" value={newSupplier.email} onChange={v => setNewSupplier(p => ({ ...p, email: v }))} />
                    <Field label="Product" placeholder="Chocolate chips" value={newSupplier.product} onChange={v => setNewSupplier(p => ({ ...p, product: v }))} />
                    <Field label="Price/unit ($)" placeholder="4.20" value={newSupplier.price} onChange={v => setNewSupplier(p => ({ ...p, price: v }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button onClick={() => setShowAddSupplier(false)} style={backBtn}>cancel</button>
                    <button onClick={addSupplier} disabled={!newSupplier.name || !newSupplier.email} style={{ ...primaryBtn, opacity: (!newSupplier.name || !newSupplier.email) ? 0.5 : 1 }}>add</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddSupplier(true)} style={{ width: "100%", padding: "12px", background: "none", border: "1px dashed #ddd", borderRadius: 10, fontSize: 12, color: "#888", cursor: "pointer", marginBottom: 14, fontFamily: "inherit" }}>
                  + add supplier
                </button>
              )}

              {suppliers.length === 0 && !showAddSupplier && (
                <div style={{ padding: "9px 14px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#bbb", marginBottom: 14 }}>
                  💡 Skip and add in Settings → Suppliers later.
                </div>
              )}
              <NavRow onBack={() => setStep(3)} onSkip={() => setStep(5)} onNext={() => setStep(5)} />
            </div>
          )}

          {/* ── Step 5: Recipes / BOM ── */}
          {step === 5 && (
            <div style={{ padding: 32 }}>
              <StepHeader title="Your recipes (BOM)" sub="Tell the agent how much of each ingredient goes into a case — it uses this to calculate order quantities" />

              {/* SKU tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                {recipes.map((r, i) => (
                  <div key={r.id} style={{ position: "relative" }}>
                    <button onClick={() => setActiveRecipe(i)} style={{ padding: "7px 13px", background: activeRecipe === i ? DARK : "#fff", color: activeRecipe === i ? "#fff" : "#888", border: `1px solid ${activeRecipe === i ? DARK : "#ebebeb"}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      {r.sku}
                    </button>
                    {activeRecipe === i && recipes.length > 1 && (
                      <button onClick={() => removeSku(i)} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#ff4d4d", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={addSku} style={{ padding: "7px 11px", background: "none", border: "1px dashed #ddd", borderRadius: 8, fontSize: 11, color: "#bbb", cursor: "pointer", fontFamily: "inherit" }}>+ SKU</button>
              </div>

              {/* Active SKU editor */}
              <div style={{ border: "1px solid #ebebeb", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                {/* SKU meta */}
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #f5f5f5", background: "#fafafa" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={colLabel}>SKU code</div>
                      <input value={recipes[activeRecipe]?.sku || ""} onChange={e => updateRecipeField(activeRecipe, "sku", e.target.value)}
                        placeholder="BB-001" style={inlineInput} />
                    </div>
                    <div>
                      <div style={colLabel}>Product name</div>
                      <input value={recipes[activeRecipe]?.name || ""} onChange={e => updateRecipeField(activeRecipe, "name", e.target.value)}
                        placeholder="Classic Brownie 4.7oz" style={inlineInput} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div>
                      <div style={colLabel}>Unit size (oz)</div>
                      <input value={recipes[activeRecipe]?.unitSize || ""} onChange={e => updateRecipeField(activeRecipe, "unitSize", e.target.value)}
                        placeholder="4.7" style={{ ...inlineInput, width: 80 }} />
                    </div>
                    <div>
                      <div style={colLabel}>Units per case</div>
                      <input type="number" value={recipes[activeRecipe]?.unitsPerCase || 10} onChange={e => updateRecipeField(activeRecipe, "unitsPerCase", parseInt(e.target.value) || 1)}
                        style={{ ...inlineInput, width: 80, textAlign: "center" }} />
                    </div>
                    <div style={{ padding: "6px 10px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 7, fontSize: 11, color: "#0a7a9a" }}>
                      <div style={{ fontWeight: 600 }}>{recipes[activeRecipe]?.unitsPerCase || 10} units/case</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{recipes[activeRecipe]?.unitSize || "?"} oz each</div>
                    </div>
                  </div>
                </div>

                {/* Ingredient table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 36px", gap: 8, padding: "8px 18px", background: "#f8f8f8", borderBottom: "1px solid #ebebeb" }}>
                  <div style={colLabel}>Ingredient</div>
                  <div style={colLabel}>Per unit</div>
                  <div style={colLabel}>Unit</div>
                  <div />
                </div>

                {/* Ingredient rows */}
                <div style={{ padding: "0 18px" }}>
                  {recipes[activeRecipe]?.ingredients?.length === 0 ? (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "#ccc", fontSize: 12 }}>
                      No ingredients yet — add one below
                    </div>
                  ) : recipes[activeRecipe].ingredients.map(ing => (
                    <div key={ing.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 36px", gap: 8, padding: "9px 0", borderBottom: "1px solid #f8f8f8", alignItems: "center" }}>
                      <div style={{ fontSize: 13, color: DARK }}>{ing.name}</div>
                      <input type="number" step="0.001" value={ing.qtyPerUnit}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setRecipes(prev => prev.map((r, i) => i !== activeRecipe ? r : {
                            ...r, ingredients: r.ingredients.map(x => x.id === ing.id ? { ...x, qtyPerUnit: val } : x)
                          }));
                        }}
                        style={{ ...inlineInput, textAlign: "center", fontSize: 12 }} />
                      <div style={{ fontSize: 12, color: "#888" }}>{ing.unit}</div>
                      <button onClick={() => removeIngredient(activeRecipe, ing.id)} style={removeBtnStyle}>✕</button>
                    </div>
                  ))}

                  {/* Per-case totals */}
                  {recipes[activeRecipe]?.ingredients?.length > 0 && (
                    <div style={{ padding: "10px 0", borderTop: "2px solid #f0f0f0", marginTop: 4 }}>
                      {["lbs", "oz"].map(unit => {
                        const total = (recipes[activeRecipe]?.ingredients || []).filter(i => i.unit === unit).reduce((s, i) => s + (i.qtyPerUnit * (recipes[activeRecipe]?.unitsPerCase || 1)), 0);
                        if (!total) return null;
                        return (
                          <div key={unit} style={{ fontSize: 11, color: "#0a7a9a", marginBottom: 2 }}>
                            <strong>{total.toFixed(2)} {unit}</strong> per case (×{recipes[activeRecipe]?.unitsPerCase})
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add ingredient form */}
                {showAddIngredient ? (
                  <div style={{ padding: "12px 18px", background: ACCENT_BG, borderTop: "1px solid #ebebeb" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px", gap: 8, marginBottom: 8 }}>
                      <input placeholder="Ingredient name" value={newIngredient.name} onChange={e => setNewIngredient(p => ({ ...p, name: e.target.value }))}
                        style={{ ...inlineInput, background: "#fff" }} />
                      <input type="number" step="0.001" placeholder="Qty" value={newIngredient.qty} onChange={e => setNewIngredient(p => ({ ...p, qty: e.target.value }))}
                        style={{ ...inlineInput, background: "#fff", textAlign: "center" }} />
                      <select value={newIngredient.unit} onChange={e => setNewIngredient(p => ({ ...p, unit: e.target.value }))}
                        style={{ ...inlineInput, background: "#fff" }}>
                        {["lbs", "oz", "kg", "g", "gal", "qt", "L", "ml", "units"].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setShowAddIngredient(false)} style={backBtn}>cancel</button>
                      <button onClick={() => addIngredient(activeRecipe)} disabled={!newIngredient.name || !newIngredient.qty}
                        style={{ ...primaryBtn, opacity: (!newIngredient.name || !newIngredient.qty) ? 0.5 : 1 }}>add</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "12px 18px", borderTop: "1px solid #f5f5f5" }}>
                    <button onClick={() => setShowAddIngredient(true)} style={{ fontSize: 12, color: "#888", background: "none", border: "1px solid #ebebeb", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      + add ingredient
                    </button>
                  </div>
                )}
              </div>

              {totalIngredients === 0 && (
                <div style={{ padding: "9px 14px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#bbb", marginBottom: 14 }}>
                  💡 Skip and add in Settings → Recipes later. Without a BOM the inventory check uses estimates.
                </div>
              )}

              <NavRow onBack={() => setStep(4)} onSkip={() => setStep(6)} onNext={() => setStep(6)} />
            </div>
          )}

          {/* ── Step 6: Done ── */}
          {step === 6 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: DARK, marginBottom: 8 }}>You're all set.</div>
              <div style={{ fontSize: 13, color: "#999", marginBottom: 20, lineHeight: 1.7 }}>
                Settings are synced to your account. Paste your first real PO to kick off the automation loop.
              </div>

              {/* Summary */}
              <div style={{ textAlign: "left", background: "#f8f8f8", borderRadius: 10, padding: "4px 16px", marginBottom: 24 }}>
                {[
                  ["Profile", yourName ? `${yourName}${companyName ? `, ${companyName}` : ""}` : "—"],
                  ["Google Sheets", sheetsUrl ? `Connected · cols ${ingredientCol}/${priceCol}/${inventoryCol} · row ${headerRow}` : "Not connected"],
                  ["Suppliers", suppliers.length > 0 ? `${suppliers.length} supplier${suppliers.length !== 1 ? "s" : ""}` : "None — add in Settings"],
                  ["Recipes", recipes.length > 0 && totalIngredients > 0 ? `${recipes.length} SKU${recipes.length !== 1 ? "s" : ""} · ${totalIngredients} ingredient${totalIngredients !== 1 ? "s" : ""}` : "Not set up"],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #ebebeb" }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                    <span style={{ fontSize: 12, color: DARK }}>{val}</span>
                  </div>
                ))}
              </div>

              {error && <ErrMsg msg={error} />}
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

// ── Shared primitives ──

function StepHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: DARK, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#bbb" }}>{sub}</div>
    </div>
  );
}

function NavRow({ onBack, onSkip, onNext }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
      {onBack && <button onClick={onBack} style={backBtn}>← back</button>}
      {onSkip && <button onClick={onSkip} style={{ ...backBtn, color: "#bbb" }}>skip</button>}
      <button onClick={onNext} style={primaryBtn}>Continue →</button>
    </div>
  );
}

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

function ColInput({ label, value, onChange, isNumber }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      <input value={value} onChange={e => onChange(isNumber ? e.target.value : e.target.value.toUpperCase())} maxLength={isNumber ? 2 : 2}
        style={{ width: "100%", padding: "9px 8px", border: "1px solid #ebebeb", borderRadius: 7, fontSize: 15, fontWeight: 700, color: DARK, fontFamily: "'DM Mono', monospace", textAlign: "center", background: "#fafafa", outline: "none" }} />
    </div>
  );
}

function ErrMsg({ msg }) {
  return <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>{msg}</div>;
}

const colLabel = { fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 };
const inlineInput = { width: "100%", padding: "7px 10px", border: "1px solid #ebebeb", borderRadius: 7, fontSize: 13, fontFamily: "inherit", color: DARK, background: "#fafafa", outline: "none" };
const removeBtnStyle = { fontSize: 11, color: "#ff4d4d", background: "#fff0f0", border: "1px solid #ffd5d5", borderRadius: 6, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" };

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
