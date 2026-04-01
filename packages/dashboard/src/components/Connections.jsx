import { useState, useEffect } from "react";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

function ls(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} style={{ width: 40, height: 22, borderRadius: 11, background: on ? ACCENT : "#e0e0e0", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
    </div>
  );
}

function StatusDot({ connected }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#2ecc71" : "#ddd" }} />
      <span style={{ fontSize: 11, color: connected ? "#2ecc71" : "#bbb", fontWeight: 500 }}>{connected ? "connected" : "not connected"}</span>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 14, overflow: "hidden", ...style }}>{children}</div>;
}

function CardHead({ icon, title, description, connected, children }) {
  return (
    <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f8f8f8", border: "1px solid #ebebeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: DARK, marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#bbb" }}>{description}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <StatusDot connected={connected} />
        {children}
      </div>
    </div>
  );
}

function Input({ label, placeholder, value, onChange, type = "text", hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>}
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 13, color: DARK, fontFamily: "inherit", outline: "none", background: "#fafafa" }} />
      {hint && <div style={{ fontSize: 11, color: "#ccc", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function SaveBtn({ onClick, saved }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 18px", background: saved ? ACCENT_BG : ACCENT, border: `1px solid ${saved ? ACCENT_BORDER : ACCENT}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: saved ? "#0a7a9a" : DARK, cursor: "pointer", transition: "all 0.2s" }}>
      {saved ? "✓ saved" : "save"}
    </button>
  );
}

function SupplierRow({ supplier, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#0a7a9a", flexShrink: 0 }}>
        {supplier.name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{supplier.name}</div>
        <div style={{ fontSize: 11, color: "#bbb" }}>{supplier.email} · {supplier.product}</div>
      </div>
      <div style={{ fontSize: 12, color: "#bbb" }}>${supplier.price}/unit</div>
      <button onClick={onRemove} style={{ fontSize: 11, color: "#ff4d4d", background: "#fff0f0", border: "1px solid #ffd5d5", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>remove</button>
    </div>
  );
}

const defaultSuppliers = [
  { id: 1, name: "Hershey's", email: "orders@hersheys.com", product: "Chocolate chips", price: "4.20" },
  { id: 2, name: "ePac", email: "orders@epacflexibles.com", product: "Packaging bags", price: "0.45" },
  { id: 3, name: "Boston Baking", email: "production@bostonbaking.com", product: "Co-packing", price: "2.10" },
];

export default function Connections() {
  const [activeTab, setActiveTab] = useState("profile");

  // Profile
  const [yourName, setYourName] = useState(() => ls("bytem_yourName", ""));
  const [companyName, setCompanyName] = useState(() => ls("bytem_companyName", ""));
  const [profileSaved, setProfileSaved] = useState(false);

  // Email
  const [emailConnected, setEmailConnected] = useState(() => ls("bytem_emailConnected", false));
  const [emailAddress, setEmailAddress] = useState(() => ls("bytem_emailAddress", ""));
  const [emailSaved, setEmailSaved] = useState(false);

  // Slack
  const [slackConnected, setSlackConnected] = useState(() => ls("bytem_slackConnected", false));
  const [slackWebhook, setSlackWebhook] = useState(() => ls("bytem_slackWebhook", ""));
  const [slackSaved, setSlackSaved] = useState(false);

  // Sheets
  const [sheetsConnected, setSheetsConnected] = useState(() => ls("bytem_sheetsConnected", false));
  const [sheetsUrl, setSheetsUrl] = useState(() => ls("bytem_sheetsUrl", ""));
  const [skuCol, setSkuCol] = useState(() => ls("bytem_skuCol", "A"));
  const [qtyCol, setQtyCol] = useState(() => ls("bytem_qtyCol", "B"));
  const [sheetsSaved, setSheetsSaved] = useState(false);

  // Kaizntree
  const [kaizntreeConnected, setKaizntreeConnected] = useState(() => ls("bytem_kaizntreeConnected", false));
  const [kaizntreeKey, setKaizntreeKey] = useState(() => ls("bytem_kaizntreeKey", ""));
  const [kaizntreeSaved, setKaizntreeSaved] = useState(false);

  // Stripe
  const [stripeConnected, setStripeConnected] = useState(() => ls("bytem_stripeConnected", false));

  // Spend rules
  const [maxPerTxn, setMaxPerTxn] = useState(() => ls("bytem_maxPerTxn", "10000"));
  const [maxMonthly, setMaxMonthly] = useState(() => ls("bytem_maxMonthly", "25000"));
  const [approvalThreshold, setApprovalThreshold] = useState(() => ls("bytem_approvalThreshold", "5000"));
  const [autoApprove, setAutoApprove] = useState(() => ls("bytem_autoApprove", true));
  const [rulesSaved, setRulesSaved] = useState(false);

  // Suppliers
  const [suppliers, setSuppliers] = useState(() => ls("bytem_suppliers", defaultSuppliers));
  const [newSupplier, setNewSupplier] = useState({ name: "", email: "", product: "", price: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [supplierSaved, setSupplierSaved] = useState(false);

  function saveWithDelay(setter) { setter(true); setTimeout(() => setter(false), 2000); }

  function saveProfile() {
    lsSet("bytem_yourName", yourName);
    lsSet("bytem_companyName", companyName);
    saveWithDelay(setProfileSaved);
  }

  function saveEmail() {
    lsSet("bytem_emailConnected", emailConnected);
    lsSet("bytem_emailAddress", emailAddress);
    saveWithDelay(setEmailSaved);
  }

  function saveSlack() {
    lsSet("bytem_slackConnected", slackConnected);
    lsSet("bytem_slackWebhook", slackWebhook);
    saveWithDelay(setSlackSaved);
  }

  function saveSheets() {
    lsSet("bytem_sheetsConnected", sheetsConnected);
    lsSet("bytem_sheetsUrl", sheetsUrl);
    lsSet("bytem_skuCol", skuCol);
    lsSet("bytem_qtyCol", qtyCol);
    saveWithDelay(setSheetsSaved);
  }

  function saveKaizntree() {
    lsSet("bytem_kaizntreeConnected", kaizntreeConnected);
    lsSet("bytem_kaizntreeKey", kaizntreeKey);
    saveWithDelay(setKaizntreeSaved);
  }

  function saveRules() {
    lsSet("bytem_maxPerTxn", maxPerTxn);
    lsSet("bytem_maxMonthly", maxMonthly);
    lsSet("bytem_approvalThreshold", approvalThreshold);
    lsSet("bytem_autoApprove", autoApprove);
    saveWithDelay(setRulesSaved);
  }

  // Recipes / BOM
  const defaultRecipes = [
    {
      id: 1, sku: "BB-001", name: "BYTE'M Brownies Classic",
      unitsPerCase: 6,
      bagSizeOz: 4.23,
      ingredients: [
        { id: 1, name: "Chocolate Chips - Semi Sweet", qtyPerUnit: 0.094, unit: "lbs" },
        { id: 2, name: "Cane Sugar", qtyPerUnit: 0.050, unit: "lbs" },
        { id: 3, name: "Butter, Salted", qtyPerUnit: 0.063, unit: "lbs" },
        { id: 4, name: "Liquid Eggs - Pasteurized", qtyPerUnit: 0.031, unit: "lbs" },
        { id: 5, name: "All Purpose Flour", qtyPerUnit: 0.038, unit: "lbs" },
      ]
    },
    {
      id: 2, sku: "BB-002", name: "BYTE'M Brownies S'Mores",
      unitsPerCase: 6,
      bagSizeOz: 4.23,
      ingredients: [
        { id: 1, name: "Chocolate Chips - Semi Sweet", qtyPerUnit: 0.078, unit: "lbs" },
        { id: 2, name: "Cane Sugar", qtyPerUnit: 0.050, unit: "lbs" },
        { id: 3, name: "Butter, Salted", qtyPerUnit: 0.063, unit: "lbs" },
        { id: 4, name: "Liquid Eggs - Pasteurized", qtyPerUnit: 0.031, unit: "lbs" },
        { id: 5, name: "All Purpose Flour", qtyPerUnit: 0.038, unit: "lbs" },
        { id: 6, name: "Mini Marshmallows", qtyPerUnit: 0.016, unit: "lbs" },
        { id: 7, name: "Graham Cracker Crumbs", qtyPerUnit: 0.012, unit: "lbs" },
      ]
    },
    {
      id: 3, sku: "BB-003", name: "BYTE'M Brownies Cookies & Cream",
      unitsPerCase: 6,
      bagSizeOz: 4.23,
      ingredients: [
        { id: 1, name: "Chocolate Chips - Semi Sweet", qtyPerUnit: 0.078, unit: "lbs" },
        { id: 2, name: "Cane Sugar", qtyPerUnit: 0.050, unit: "lbs" },
        { id: 3, name: "Butter, Salted", qtyPerUnit: 0.063, unit: "lbs" },
        { id: 4, name: "Liquid Eggs - Pasteurized", qtyPerUnit: 0.031, unit: "lbs" },
        { id: 5, name: "All Purpose Flour", qtyPerUnit: 0.038, unit: "lbs" },
        { id: 6, name: "Oreo Cookie Pieces", qtyPerUnit: 0.025, unit: "lbs" },
      ]
    },
  ];

  const [recipes, setRecipes] = useState(() => {
    const saved = ls("bytem_recipes", null);
    if (!saved) return defaultRecipes;
    // migrate old format (qty → qtyPerUnit)
    return saved.map(r => ({
      ...r,
      unitsPerCase: r.unitsPerCase || 6,
      bagSizeOz: r.bagSizeOz || 4.23,
      ingredients: (r.ingredients || []).map(ing => ({
        ...ing,
        qtyPerUnit: ing.qtyPerUnit ?? ing.qty ?? 0,
      }))
    }));
  });
  const [activeRecipe, setActiveRecipe] = useState(0);
  const [recipeSaved, setRecipeSaved] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: "", qty: "", unit: "lbs" });
  const [showIngredientForm, setShowIngredientForm] = useState(false);

  function saveRecipes(updated) {
    lsSet("bytem_recipes", updated);
    setRecipes(updated);
    saveWithDelay(setRecipeSaved);
  }

  function updateIngredient(recipeIdx, ingId, field, val) {
    const updated = recipes.map((r, ri) => ri !== recipeIdx ? r : {
      ...r,
      ingredients: r.ingredients.map(ing => ing.id === ingId ? { ...ing, [field]: field === "qtyPerUnit" ? parseFloat(val) || 0 : val } : ing)
    });
    saveRecipes(updated);
  }

  function updateUnitsPerCase(recipeIdx, val) {
    const updated = recipes.map((r, ri) => ri !== recipeIdx ? r : { ...r, unitsPerCase: parseInt(val) || 1 });
    saveRecipes(updated);
  }

  function removeIngredient(recipeIdx, ingId) {
    const updated = recipes.map((r, ri) => ri !== recipeIdx ? r : {
      ...r, ingredients: r.ingredients.filter(ing => ing.id !== ingId)
    });
    saveRecipes(updated);
  }

  function addIngredient(recipeIdx) {
    if (!newIngredient.name || !newIngredient.qty) return;
    const updated = recipes.map((r, ri) => ri !== recipeIdx ? r : {
      ...r, ingredients: [...r.ingredients, { ...newIngredient, id: Date.now(), qtyPerUnit: parseFloat(newIngredient.qty) }]
    });
    saveRecipes(updated);
    setNewIngredient({ name: "", qty: "", unit: "lbs" });
    setShowIngredientForm(false);
  }

  function addSupplier() {
    if (!newSupplier.name || !newSupplier.email) return;
    const updated = [...suppliers, { ...newSupplier, id: Date.now() }];
    setSuppliers(updated);
    lsSet("bytem_suppliers", updated);
    setNewSupplier({ name: "", email: "", product: "", price: "" });
    setShowAddForm(false);
    saveWithDelay(setSupplierSaved);
  }

  function removeSupplier(id) {
    const updated = suppliers.filter(s => s.id !== id);
    setSuppliers(updated);
    lsSet("bytem_suppliers", updated);
  }

  const tabs = ["profile", "connections", "suppliers", "recipes", "spend rules"];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'DM Mono', 'Fira Code', monospace", color: DARK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: ${ACCENT} !important; background: ${ACCENT_BG} !important; }
        input::placeholder { color: #ccc; }
        .tab-btn:hover { color: ${DARK} !important; }
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 18px", borderBottom: "1px solid #ebebeb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: DARK }}>B</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", color: DARK }}>byte'm ops</div>
              <div style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.08em", textTransform: "uppercase" }}>settings & connections</div>
            </div>
          </div>
          <a href="/" style={{ fontSize: 12, color: "#bbb", textDecoration: "none", fontWeight: 500 }}>← back to dashboard</a>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 24, padding: "16px 0", borderBottom: "1px solid #ebebeb", marginBottom: 24 }}>
          {tabs.map(tab => (
            <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, color: activeTab === tab ? DARK : "#bbb", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 0", transition: "color 0.2s", borderBottom: activeTab === tab ? `2px solid ${ACCENT}` : "2px solid transparent" }}>
              {tab}
            </button>
          ))}
        </div>

        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <div style={{ paddingBottom: 32 }}>
            <Card>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>Your profile</div>
                <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>Used to sign supplier emails and personalize agent actions</div>
              </div>
              <div style={{ padding: "16px 22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                  <Input label="Your name" placeholder="Jack Davis" value={yourName} onChange={setYourName} hint="Appears as sender in supplier emails" />
                  <Input label="Company name" placeholder="BYTE'M Brownies" value={companyName} onChange={setCompanyName} hint="Used in email signatures" />
                </div>
                {yourName && (
                  <div style={{ padding: "10px 14px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#0a7a9a" }}>Emails will be signed: <strong>{yourName}{companyName ? `, ${companyName}` : ""}</strong></div>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <SaveBtn onClick={saveProfile} saved={profileSaved} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* CONNECTIONS TAB */}
        {activeTab === "connections" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            <Card>
              <CardHead icon="📧" title="Email — PO ingestion" description="Forward purchase orders here and the agent reads them automatically" connected={emailConnected}>
                <Toggle on={emailConnected} onChange={v => { setEmailConnected(v); lsSet("bytem_emailConnected", v); }} />
              </CardHead>
              {emailConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <div style={{ padding: "10px 14px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#0a7a9a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Your dedicated PO inbox</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DARK, fontFamily: "monospace" }}>orders@bytem.agentwallet.app</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Forward HomeGoods, TJX, or any retailer POs here</div>
                  </div>
                  <Input label="Or forward from your email" placeholder="orders@bytem.com" value={emailAddress} onChange={setEmailAddress} hint="We'll set up auto-forwarding rules for you" />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={saveEmail} saved={emailSaved} />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHead icon="💬" title="Slack — approval notifications" description="Get notified when payments need approval or agents are blocked" connected={slackConnected}>
                <Toggle on={slackConnected} onChange={v => { setSlackConnected(v); lsSet("bytem_slackConnected", v); }} />
              </CardHead>
              {slackConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Slack webhook URL" placeholder="https://hooks.slack.com/services/..." value={slackWebhook} onChange={setSlackWebhook} hint="Create a webhook in your Slack workspace settings" />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={saveSlack} saved={slackSaved} />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHead icon="📊" title="Google Sheets — inventory" description="Connect your inventory spreadsheet so the agent knows what you have on hand" connected={sheetsConnected}>
                <Toggle on={sheetsConnected} onChange={v => { setSheetsConnected(v); lsSet("bytem_sheetsConnected", v); }} />
              </CardHead>
              {sheetsConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Google Sheets URL" placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsUrl} onChange={setSheetsUrl} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <Input label="SKU column" placeholder="A" value={skuCol} onChange={setSkuCol} />
                    <Input label="Quantity on hand column" placeholder="B" value={qtyCol} onChange={setQtyCol} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={saveSheets} saved={sheetsSaved} />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHead icon="🌴" title="Kaizntree — inventory & ops" description="Pull live inventory and production data directly from Kaizntree" connected={kaizntreeConnected}>
                <Toggle on={kaizntreeConnected} onChange={v => { setKaizntreeConnected(v); lsSet("bytem_kaizntreeConnected", v); }} />
              </CardHead>
              {kaizntreeConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Kaizntree API key" placeholder="kz_live_..." value={kaizntreeKey} onChange={setKaizntreeKey} type="password" hint="Find this in Kaizntree → Settings → API" />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={saveKaizntree} saved={kaizntreeSaved} />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHead icon="💳" title="Stripe — payment execution" description="Connect Stripe to execute governed supplier payments automatically" connected={stripeConnected}>
                <Toggle on={stripeConnected} onChange={v => { setStripeConnected(v); lsSet("bytem_stripeConnected", v); }} />
              </CardHead>
              {stripeConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <div style={{ padding: "12px 14px", background: "#f8f8f8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>Connect with Stripe</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>Securely link your Stripe account via OAuth</div>
                    </div>
                    <button style={{ padding: "8px 16px", background: "#635bff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Connect Stripe →</button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* SUPPLIERS TAB */}
        {activeTab === "suppliers" && (
          <div style={{ paddingBottom: 32 }}>
            <Card>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>Supplier directory</div>
                  <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>The agent uses this to draft and send supplier orders</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {supplierSaved && <span style={{ fontSize: 11, color: "#0a7a9a" }}>✓ saved</span>}
                  <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: "8px 16px", background: ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: DARK, cursor: "pointer" }}>
                    + add supplier
                  </button>
                </div>
              </div>

              {showAddForm && (
                <div style={{ padding: "16px 22px", background: ACCENT_BG, borderBottom: "1px solid #ebebeb" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0a7a9a", marginBottom: 12 }}>New supplier</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Input label="Company name" placeholder="Hershey's" value={newSupplier.name} onChange={v => setNewSupplier(p => ({ ...p, name: v }))} />
                    <Input label="Email" placeholder="orders@supplier.com" value={newSupplier.email} onChange={v => setNewSupplier(p => ({ ...p, email: v }))} />
                    <Input label="Product / ingredient" placeholder="Chocolate chips" value={newSupplier.product} onChange={v => setNewSupplier(p => ({ ...p, product: v }))} />
                    <Input label="Typical price per unit" placeholder="4.20" value={newSupplier.price} onChange={v => setNewSupplier(p => ({ ...p, price: v }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button onClick={() => setShowAddForm(false)} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #ebebeb", borderRadius: 7, fontSize: 12, cursor: "pointer", color: "#888" }}>cancel</button>
                    <button onClick={addSupplier} style={{ padding: "7px 14px", background: ACCENT, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, color: DARK, cursor: "pointer" }}>add supplier</button>
                  </div>
                </div>
              )}

              <div style={{ padding: "0 22px" }}>
                {suppliers.map(s => (
                  <SupplierRow key={s.id} supplier={s} onRemove={() => removeSupplier(s.id)} />
                ))}
                {suppliers.length === 0 && (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#ccc", fontSize: 13 }}>No suppliers yet — add one above</div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* RECIPES TAB */}
        {activeTab === "recipes" && (
          <div style={{ paddingBottom: 32 }}>
            {/* SKU selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {recipes.map((r, i) => (
                <button key={r.id} onClick={() => setActiveRecipe(i)} style={{ padding: "8px 14px", background: activeRecipe === i ? DARK : "#fff", color: activeRecipe === i ? "#fff" : "#888", border: `1px solid ${activeRecipe === i ? DARK : "#ebebeb"}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {r.sku}
                </button>
              ))}
            </div>

            <Card>
              {/* SKU header + units per case */}
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{recipes[activeRecipe]?.name}</div>
                    <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>Bill of materials — enter quantities per finished bag</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8f8f8", border: "1px solid #ebebeb", borderRadius: 9, padding: "8px 14px" }}>
                    <div style={{ fontSize: 11, color: "#888" }}>Bag size</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{recipes[activeRecipe]?.bagSizeOz} oz</div>
                    <div style={{ width: 1, height: 16, background: "#ebebeb" }} />
                    <div style={{ fontSize: 11, color: "#888" }}>Units / case</div>
                    <input
                      type="number"
                      value={recipes[activeRecipe]?.unitsPerCase}
                      onChange={e => updateUnitsPerCase(activeRecipe, e.target.value)}
                      style={{ width: 40, padding: "3px 6px", border: "1px solid #ebebeb", borderRadius: 6, fontSize: 13, fontWeight: 700, color: DARK, fontFamily: "inherit", textAlign: "center", background: "#fff" }}
                    />
                  </div>
                </div>
              </div>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 36px", gap: 8, padding: "10px 22px", background: "#f8f8f8", borderBottom: "1px solid #ebebeb" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em" }}>Ingredient</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em" }}>Per bag</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.07em" }}>Per case ×{recipes[activeRecipe]?.unitsPerCase}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em" }}>Per 144 cases</div>
                <div />
              </div>

              {/* Ingredient rows */}
              <div style={{ padding: "0 22px" }}>
                {recipes[activeRecipe]?.ingredients.map(ing => {
                  const perCase = (ing.qtyPerUnit * recipes[activeRecipe].unitsPerCase);
                  const per144 = (perCase * 144);
                  return (
                    <div key={ing.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 36px", gap: 8, padding: "10px 0", borderBottom: "1px solid #f8f8f8", alignItems: "center" }}>
                      <div style={{ fontSize: 13, color: DARK }}>{ing.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          step="0.001"
                          value={ing.qtyPerUnit}
                          onChange={e => updateIngredient(activeRecipe, ing.id, "qtyPerUnit", e.target.value)}
                          style={{ width: 60, padding: "5px 6px", border: "1px solid #ebebeb", borderRadius: 6, fontSize: 12, color: DARK, fontFamily: "inherit", background: "#fafafa" }}
                        />
                        <select
                          value={ing.unit}
                          onChange={e => updateIngredient(activeRecipe, ing.id, "unit", e.target.value)}
                          style={{ padding: "5px 4px", border: "1px solid #ebebeb", borderRadius: 6, fontSize: 11, color: DARK, fontFamily: "inherit", background: "#fafafa" }}
                        >
                          {["lbs", "oz", "kg", "g", "gal", "qt", "L", "ml", "units"].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0a7a9a" }}>
                        {perCase.toFixed(3)} {ing.unit}
                      </div>
                      <div style={{ fontSize: 12, color: "#bbb" }}>
                        {per144.toFixed(1)} {ing.unit}
                      </div>
                      <button onClick={() => removeIngredient(activeRecipe, ing.id)} style={{ fontSize: 11, color: "#ff4d4d", background: "#fff0f0", border: "1px solid #ffd5d5", borderRadius: 6, padding: "4px 6px", cursor: "pointer" }}>✕</button>
                    </div>
                  );
                })}

                {/* Totals row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 36px", gap: 8, padding: "12px 0", borderTop: "2px solid #f0f0f0", marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#888" }}>Total (lbs only)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>
                    {recipes[activeRecipe]?.ingredients.filter(i => i.unit === "lbs").reduce((s, i) => s + i.qtyPerUnit, 0).toFixed(3)} lbs
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0a7a9a" }}>
                    {recipes[activeRecipe]?.ingredients.filter(i => i.unit === "lbs").reduce((s, i) => s + (i.qtyPerUnit * recipes[activeRecipe].unitsPerCase), 0).toFixed(2)} lbs
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#bbb" }}>
                    {recipes[activeRecipe]?.ingredients.filter(i => i.unit === "lbs").reduce((s, i) => s + (i.qtyPerUnit * recipes[activeRecipe].unitsPerCase * 144), 0).toFixed(1)} lbs
                  </div>
                  <div />
                </div>
              </div>

              {/* Add ingredient form */}
              {showIngredientForm && (
                <div style={{ padding: "14px 22px", background: ACCENT_BG, borderTop: "1px solid #ebebeb" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0a7a9a", marginBottom: 10 }}>Add ingredient</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px", gap: 8, marginBottom: 8 }}>
                    <input placeholder="Ingredient name" value={newIngredient.name} onChange={e => setNewIngredient(p => ({ ...p, name: e.target.value }))}
                      style={{ padding: "8px 10px", border: `1px solid ${ACCENT_BORDER}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    <input type="number" step="0.001" placeholder="Qty per bag" value={newIngredient.qty} onChange={e => setNewIngredient(p => ({ ...p, qty: e.target.value }))}
                      style={{ padding: "8px 10px", border: `1px solid ${ACCENT_BORDER}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    <select value={newIngredient.unit} onChange={e => setNewIngredient(p => ({ ...p, unit: e.target.value }))}
                      style={{ padding: "8px 10px", border: `1px solid ${ACCENT_BORDER}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff" }}>
                      {["lbs", "oz", "kg", "g", "gal", "qt", "L", "ml", "units"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowIngredientForm(false)} style={{ padding: "6px 12px", background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#888" }}>cancel</button>
                    <button onClick={() => addIngredient(activeRecipe)} style={{ padding: "6px 14px", background: ACCENT, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, color: DARK, cursor: "pointer" }}>add</button>
                  </div>
                </div>
              )}

              <div style={{ padding: "14px 22px", borderTop: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setShowIngredientForm(!showIngredientForm)} style={{ fontSize: 12, color: "#888", background: "none", border: "1px solid #ebebeb", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
                  + add ingredient
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {recipeSaved && <span style={{ fontSize: 11, color: "#0a7a9a" }}>✓ saved</span>}
                  <SaveBtn onClick={() => saveRecipes(recipes)} saved={recipeSaved} />
                </div>
              </div>
            </Card>

            {/* Cross-SKU summary */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Total ingredients for a full 144-case run (all 3 SKUs)
              </div>
              <Card>
                <div style={{ padding: "0 22px" }}>
                  {(() => {
                    const allIngs = {};
                    recipes.forEach(r => r.ingredients.forEach(ing => {
                      const key = `${ing.name}__${ing.unit}`;
                      if (!allIngs[key]) allIngs[key] = { name: ing.name, unit: ing.unit, total: 0 };
                      allIngs[key].total += ing.qtyPerUnit * r.unitsPerCase * 144;
                    }));
                    return Object.values(allIngs).map((ing, i, arr) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                        <span style={{ fontSize: 13, color: DARK }}>{ing.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{ing.total.toFixed(1)} <span style={{ fontWeight: 400, color: "#bbb" }}>{ing.unit}</span></span>
                      </div>
                    ));
                  })()}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* SPEND RULES TAB */}
        {activeTab === "spend rules" && (
          <div style={{ paddingBottom: 32, display: "flex", flexDirection: "column", gap: 12 }}>
            <Card>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>Transaction limits</div>
                <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>These rules run on every payment before it executes</div>
              </div>
              <div style={{ padding: "16px 22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <Input label="Max per transaction ($)" placeholder="10000" value={maxPerTxn} onChange={setMaxPerTxn} hint="Payments over this are blocked automatically" />
                  <Input label="Max per supplier / month ($)" placeholder="25000" value={maxMonthly} onChange={setMaxMonthly} hint="Resets on the 1st of each month" />
                </div>
                <Input label="Require approval above ($)" placeholder="5000" value={approvalThreshold} onChange={setApprovalThreshold} hint="You'll get a Slack ping and have to approve manually" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>Auto-approve under threshold</div>
                    <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>Payments under ${approvalThreshold || "5000"} execute automatically</div>
                  </div>
                  <Toggle on={autoApprove} onChange={setAutoApprove} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <SaveBtn onClick={saveRules} saved={rulesSaved} />
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
