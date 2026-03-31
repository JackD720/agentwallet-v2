import { useState } from "react";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

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
  return (
    <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 14, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
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
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 13, color: DARK, fontFamily: "inherit", outline: "none", background: "#fafafa" }}
      />
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

export default function Connections() {
  const [activeTab, setActiveTab] = useState("connections");

  // Profile
  const [yourName, setYourName] = useState(() => { try { return localStorage.getItem('bytem_yourName') || ''; } catch { return ''; } });
  const [companyName, setCompanyName] = useState(() => { try { return localStorage.getItem('bytem_companyName') || ''; } catch { return ''; } });
  const [profileSaved, setProfileSaved] = useState(false);

  function saveProfile() {
    try { localStorage.setItem('bytem_yourName', yourName); localStorage.setItem('bytem_companyName', companyName); } catch {}
    saveWithDelay(setProfileSaved);
  }

  // Email
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackSaved, setSlackSaved] = useState(false);

  // Inventory
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [skuCol, setSkuCol] = useState("A");
  const [qtyCol, setQtyCol] = useState("B");
  const [sheetsSaved, setSheetsSaved] = useState(false);
  const [kaizntreeConnected, setKaizntreeConnected] = useState(false);
  const [kaizntreeKey, setKaizntreeKey] = useState("");
  const [kaizntreeSaved, setKaizntreeSaved] = useState(false);

  // Payments
  const [stripeConnected, setStripeConnected] = useState(false);
  const [maxPerTxn, setMaxPerTxn] = useState("10000");
  const [maxMonthly, setMaxMonthly] = useState("25000");
  const [approvalThreshold, setApprovalThreshold] = useState("5000");
  const [autoApprove, setAutoApprove] = useState(true);
  const [rulesSaved, setRulesSaved] = useState(false);

  // Suppliers
  const [suppliers, setSuppliers] = useState([
    { id: 1, name: "Hershey's", email: "orders@hersheys.com", product: "Chocolate chips", price: "4.20" },
    { id: 2, name: "ePac", email: "orders@epacflexibles.com", product: "Packaging bags", price: "0.45" },
    { id: 3, name: "Boston Baking", email: "production@bostonbaking.com", product: "Co-packing", price: "2.10" },
  ]);
  const [newSupplier, setNewSupplier] = useState({ name: "", email: "", product: "", price: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  function addSupplier() {
    if (!newSupplier.name || !newSupplier.email) return;
    setSuppliers(prev => [...prev, { ...newSupplier, id: Date.now() }]);
    setNewSupplier({ name: "", email: "", product: "", price: "" });
    setShowAddForm(false);
  }

  function saveWithDelay(setter) {
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  const tabs = ["profile", "connections", "suppliers", "spend rules"];

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
                  <Input label="Your name" placeholder="Jack Davis" value={yourName} onChange={setYourName} hint="Appears as the sender in supplier emails" />
                  <Input label="Company name" placeholder="BYTE'M Brownies" value={companyName} onChange={setCompanyName} hint="Used in email signatures and order requests" />
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

            {/* Email */}
            <Card>
              <CardHead icon="📧" title="Email — PO ingestion" description="Forward purchase orders here and the agent reads them automatically" connected={emailConnected}>
                <Toggle on={emailConnected} onChange={setEmailConnected} />
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
                    <SaveBtn onClick={() => saveWithDelay(setEmailSaved)} saved={emailSaved} />
                  </div>
                </div>
              )}
            </Card>

            {/* Slack */}
            <Card>
              <CardHead icon="💬" title="Slack — approval notifications" description="Get notified when payments need approval or agents are blocked" connected={slackConnected}>
                <Toggle on={slackConnected} onChange={setSlackConnected} />
              </CardHead>
              {slackConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Slack webhook URL" placeholder="https://hooks.slack.com/services/..." value={slackWebhook} onChange={setSlackWebhook} hint="Create a webhook in your Slack workspace settings" />
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Notify me when</div>
                    {[
                      "Payment needs approval",
                      "Payment blocked by spend rule",
                      "New PO received",
                      "Supplier email sent",
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5f5f5" }}>
                        <span style={{ fontSize: 12, color: "#555" }}>{item}</span>
                        <Toggle on={true} onChange={() => {}} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={() => saveWithDelay(setSlackSaved)} saved={slackSaved} />
                  </div>
                </div>
              )}
            </Card>

            {/* Google Sheets */}
            <Card>
              <CardHead icon="📊" title="Google Sheets — inventory" description="Connect your inventory spreadsheet so the agent knows what you have on hand" connected={sheetsConnected}>
                <Toggle on={sheetsConnected} onChange={setSheetsConnected} />
              </CardHead>
              {sheetsConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Google Sheets URL" placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsUrl} onChange={setSheetsUrl} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <Input label="SKU column" placeholder="A" value={skuCol} onChange={setSkuCol} />
                    <Input label="Quantity on hand column" placeholder="B" value={qtyCol} onChange={setQtyCol} />
                  </div>
                  <div style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#bbb" }}>Make sure the sheet is shared with <span style={{ color: DARK, fontFamily: "monospace" }}>agent@bytem.agentwallet.app</span> as a viewer</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={() => saveWithDelay(setSheetsSaved)} saved={sheetsSaved} />
                  </div>
                </div>
              )}
            </Card>

            {/* Kaizntree */}
            <Card>
              <CardHead icon="🌴" title="Kaizntree — inventory & ops" description="Pull live inventory and production data directly from Kaizntree" connected={kaizntreeConnected}>
                <Toggle on={kaizntreeConnected} onChange={setKaizntreeConnected} />
              </CardHead>
              {kaizntreeConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <Input label="Kaizntree API key" placeholder="kz_live_..." value={kaizntreeKey} onChange={setKaizntreeKey} type="password" hint="Find this in Kaizntree → Settings → API" />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <SaveBtn onClick={() => saveWithDelay(setKaizntreeSaved)} saved={kaizntreeSaved} />
                  </div>
                </div>
              )}
            </Card>

            {/* Stripe */}
            <Card>
              <CardHead icon="💳" title="Stripe — payment execution" description="Connect Stripe to execute governed supplier payments automatically" connected={stripeConnected}>
                <Toggle on={stripeConnected} onChange={setStripeConnected} />
              </CardHead>
              {stripeConnected && (
                <div style={{ padding: "16px 22px" }}>
                  <div style={{ padding: "12px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>Connect with Stripe</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>Securely link your Stripe account via OAuth</div>
                    </div>
                    <button style={{ padding: "8px 16px", background: "#635bff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
                      Connect Stripe →
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#ccc" }}>Payments only execute after passing your spend rules. Nothing moves without governance.</div>
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
                <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: "8px 16px", background: ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: DARK, cursor: "pointer" }}>
                  + add supplier
                </button>
              </div>

              {showAddForm && (
                <div style={{ padding: "16px 22px", background: ACCENT_BG, borderBottom: "1px solid #ebebeb" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0a7a9a", marginBottom: 12 }}>New supplier</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Input label="Company name" placeholder="Hershey's" value={newSupplier.name} onChange={v => setNewSupplier(p => ({ ...p, name: v }))} />
                    <Input label="Email" placeholder="orders@supplier.com" value={newSupplier.email} onChange={v => setNewSupplier(p => ({ ...p, email: v }))} />
                    <Input label="Product / ingredient" placeholder="Dark chocolate chips" value={newSupplier.product} onChange={v => setNewSupplier(p => ({ ...p, product: v }))} />
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
                  <SupplierRow key={s.id} supplier={s} onRemove={() => setSuppliers(prev => prev.filter(x => x.id !== s.id))} />
                ))}
                {suppliers.length === 0 && (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#ccc", fontSize: 13 }}>No suppliers yet — add one above</div>
                )}
              </div>
            </Card>
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
                  <SaveBtn onClick={() => saveWithDelay(setRulesSaved)} saved={rulesSaved} />
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>Audit log</div>
                <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>Every agent action is logged here</div>
              </div>
              <div style={{ padding: "0 22px" }}>
                {[
                  { action: "Payment executed", detail: "$4,200 to Hershey's", time: "2m ago", type: "approved" },
                  { action: "Payment queued", detail: "$8,500 to ePac — awaiting approval", time: "2m ago", type: "pending" },
                  { action: "Payment blocked", detail: "$15,000 to Boston Baking — over limit", time: "2m ago", type: "blocked" },
                  { action: "Supplier email sent", detail: "Hershey's — 1,470 lbs chocolate chips", time: "3m ago", type: "approved" },
                  { action: "PO parsed", detail: "HG-2026-4471 from HomeGoods — 960 cases", time: "5m ago", type: "approved" },
                ].map((log, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: log.type === "approved" ? ACCENT : log.type === "pending" ? "#f59e0b" : "#ff4d4d" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: DARK }}>{log.action}</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>{log.detail}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#ccc" }}>{log.time}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
