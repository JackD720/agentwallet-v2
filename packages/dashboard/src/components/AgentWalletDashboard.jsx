/**
 * Kalshi Trading Dashboard
 * Matches Governance Engine design system exactly
 */
import { useState, useEffect, useCallback } from "react";

const API_BASE = 'https://live-trader-164814074525.us-central1.run.app';

async function apiRequest(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

// ─── Design System (matches Governance) ───
const c = {
  bg: "#0a0a0f", surface: "#12121a", surfaceAlt: "#181824",
  border: "#1e1e2e", borderHover: "#2a2a3e",
  text: "#e2e2e8", textDim: "#6b6b80", textMuted: "#44445a",
  accent: "#00e5a0", accentDim: "#00e5a020",
  danger: "#ff4466", dangerDim: "#ff446620",
  warn: "#ffaa00", warnDim: "#ffaa0020",
  blue: "#4488ff", blueDim: "#4488ff20",
};
const mono = "'JetBrains Mono', 'SF Mono', monospace";
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function Badge({ children, color = "accent" }) {
  const bg = c[color + "Dim"] || c.accentDim;
  const fg = c[color] || c.accent;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 4,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 600, fontFamily: mono,
      letterSpacing: "0.02em", textTransform: "uppercase",
      border: `1px solid ${fg}30`,
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, color = c.accent }) {
  return (
    <div style={{
      padding: "16px 20px", background: c.surface,
      borderRadius: 8, border: `1px solid ${c.border}`, minWidth: 140, flex: 1,
    }}>
      <div style={{ fontSize: 11, color: c.textDim, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: mono, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ left, right }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.1em", color: c.textMuted, padding: "4px 0",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span>{left}</span>
      {right && <span style={{ fontFamily: mono }}>{right}</span>}
    </div>
  );
}

function PositionsTable({ positions }) {
  if (!positions?.length) return <div style={{ padding: 20, textAlign: "center", color: c.textMuted, fontSize: 11 }}>No open positions</div>;
  const th = { padding: "8px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: c.textMuted, borderBottom: `1px solid ${c.border}` };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>
        <th style={{ ...th, textAlign: "left" }}>Market</th>
        <th style={{ ...th, textAlign: "center" }}>Side</th>
        <th style={{ ...th, textAlign: "right" }}>Qty</th>
        <th style={{ ...th, textAlign: "right" }}>Exposure</th>
      </tr></thead>
      <tbody>
        {positions.map((p, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
            <td style={{ padding: "10px 12px", fontFamily: mono, fontSize: 11, color: c.textDim, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.ticker || p.market_ticker || '—'}</td>
            <td style={{ padding: "10px 12px", textAlign: "center" }}><Badge color={(p.side||'yes').toLowerCase()==='yes'?'accent':'danger'}>{(p.side||'yes').toUpperCase()}</Badge></td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: mono, fontSize: 12, color: c.text }}>{p.total_traded ?? p.quantity ?? 0}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: mono, fontSize: 12, color: c.accent }}>${((p.market_exposure||0)/100).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecentTrades() {
  const [fills, setFills] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiRequest('GET', '/trades').then(d => setFills(d.fills||[])).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div style={{ padding: 20, textAlign: "center", color: c.textMuted, fontSize: 11 }}>Loading…</div>;
  if (!fills.length) return <div style={{ padding: 20, textAlign: "center", color: c.textMuted, fontSize: 11 }}>No trades yet</div>;
  const th = { padding: "8px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: c.textMuted, borderBottom: `1px solid ${c.border}` };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>
        <th style={{ ...th, textAlign: "left" }}>Time</th><th style={{ ...th, textAlign: "left" }}>Action</th>
        <th style={{ ...th, textAlign: "left" }}>Ticker</th><th style={{ ...th, textAlign: "right" }}>Qty × Price</th>
      </tr></thead>
      <tbody>{fills.slice(0,10).map((f,i) => (
        <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
          <td style={{ padding: "8px 12px", fontFamily: mono, fontSize: 11, color: c.textDim, whiteSpace: "nowrap" }}>{f.created_time ? new Date(f.created_time).toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
          <td style={{ padding: "8px 12px" }}><Badge color={f.action==='buy'?'accent':'danger'}>{(f.action||'buy').toUpperCase()}</Badge></td>
          <td style={{ padding: "8px 12px", fontFamily: mono, fontSize: 11, color: c.textDim, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.ticker||'—'}</td>
          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: mono, fontSize: 12, color: c.text }}>{f.count??f.yes_count??f.no_count??'—'}× {f.yes_price??f.no_price??'—'}¢</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function AuditLog({ refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchEvents = useCallback(async () => {
    try { setEvents((await apiRequest('GET', '/audit')).entries||[]); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchEvents(); const i = setInterval(fetchEvents, 15000); return () => clearInterval(i); }, [fetchEvents, refreshKey]);
  const getColor = (t) => {
    const s = (t||'').toLowerCase();
    if (s.includes('complete')||s.includes('executed')||s.includes('success')||s.includes('started')) return c.accent;
    if (s.includes('denied')||s.includes('blocked')||s.includes('error')||s.includes('kill')) return c.danger;
    if (s.includes('approved')) return c.blue;
    if (s.includes('warn')) return c.warn;
    return c.textDim;
  };
  if (loading) return <div style={{ padding: 20, textAlign: "center", color: c.textMuted, fontSize: 11 }}>Loading…</div>;
  if (!events.length) return <div style={{ padding: 20, textAlign: "center", color: c.textMuted, fontSize: 11 }}>Audit entries will appear here as signals are processed</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {events.slice(0,25).map((event, i) => {
        const col = getColor(event.event);
        return (
          <div key={event.event_id||i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, borderLeft: `3px solid ${col}`, background: `${col}08` }}>
            <span style={{ fontSize: 10, color: c.textMuted, fontFamily: mono, minWidth: 50, whiteSpace: "nowrap" }}>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—'}</span>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", fontFamily: mono, color: col, whiteSpace: "nowrap" }}>{(event.event||event.event_type||'').replace(/_/g,' ')}</span>
            <span style={{ fontSize: 10, color: c.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{event.details ? (typeof event.details==='string' ? event.details : JSON.stringify(event.details).slice(0,60)) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function KillSwitch({ isActive, onToggle }) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const handleToggle = async () => {
    if (!isActive && !window.confirm('⚠️ ACTIVATE KILL SWITCH?\n\nThis will block all new trading.')) return;
    setLoading(true);
    try { await apiRequest('POST', `/kill-switch?activate=${!isActive}&reason=${encodeURIComponent(reason||'dashboard')}`); onToggle?.(); }
    catch (e) { alert(`Failed: ${e.message}`); } finally { setLoading(false); }
  };
  return (
    <div style={{ padding: 16, background: isActive ? c.dangerDim : c.surface, borderRadius: 8, border: `1px solid ${isActive ? c.danger+'40' : c.border}`, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? c.danger : c.accent, boxShadow: isActive ? `0 0 8px ${c.danger}` : 'none' }} />
        <div><div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>Kill Switch</div><div style={{ fontSize: 10, color: c.textMuted }}>Emergency stop for all agents</div></div>
      </div>
      {!isActive && <input type="text" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 12, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />}
      <button onClick={handleToggle} disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: isActive ? c.accentDim : c.dangerDim, color: isActive ? c.accent : c.danger, fontSize: 11, fontWeight: 700, fontFamily: mono, letterSpacing: "0.06em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
        {loading ? "…" : isActive ? "✓ RESET KILL SWITCH" : "⊘ ACTIVATE KILL SWITCH"}
      </button>
    </div>
  );
}

function RunTradeCycle({ onComplete, killActive }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const handleRun = async () => {
    setRunning(true); setResult(null);
    try { const r = await apiRequest('POST', '/run'); setResult(r); onComplete?.(); }
    catch (e) { setResult({ error: e.message }); } finally { setRunning(false); }
  };
  return (
    <div style={{ padding: 16, background: c.surface, borderRadius: 8, border: `1px solid ${c.border}`, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, background: c.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: c.accent }}>▶</div>
        <div><div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>Trade Cycle</div><div style={{ fontSize: 10, color: c.textMuted }}>Signal → Match → Govern → Execute</div></div>
      </div>
      <button onClick={handleRun} disabled={running || killActive} style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", background: running||killActive ? `${c.textMuted}30` : c.accentDim, color: running||killActive ? c.textMuted : c.accent, fontSize: 11, fontWeight: 700, fontFamily: mono, letterSpacing: "0.06em", textTransform: "uppercase", cursor: running||killActive ? "not-allowed" : "pointer" }}>
        {running ? "⟳ RUNNING…" : killActive ? "⊘ KILL SWITCH ACTIVE" : "▶ RUN TRADE CYCLE"}
      </button>
      {result && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: result.error ? c.dangerDim : c.accentDim, color: result.error ? c.danger : c.accent, fontSize: 11, fontFamily: mono, border: `1px solid ${result.error ? c.danger : c.accent}30` }}>
          {result.error ? `Error: ${result.error}` : <>✓ {result.results?.total??0} signals → {result.results?.matched??0} matched → {result.results?.approved??0} approved → {result.results?.executed??0} executed
            {(result.results?.trades||[]).map((t,i) => <div key={i} style={{ marginTop: 4, color: c.blue }}>💸 {t.side?.toUpperCase()} {t.count}× {t.ticker} @ {t.price}¢</div>)}
          </>}
        </div>
      )}
    </div>
  );
}

export default function KalshiTradingDashboard() {
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchDashboard = useCallback(async () => { try { setDashData(await apiRequest('GET', '/dashboard')); } catch { setDashData(null); } finally { setLoading(false); } }, []);
  useEffect(() => { fetchDashboard(); const i = setInterval(fetchDashboard, 15000); return () => clearInterval(i); }, [fetchDashboard, refreshKey]);
  const handleRefresh = () => { setRefreshKey(k => k + 1); fetchDashboard(); };

  if (loading) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: c.textMuted, fontSize: 12 }}>Loading…</div>;
  if (!dashData) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 32, opacity: 0.2 }}>⚡</div>
      <div style={{ fontSize: 13, color: c.textDim }}>Live Trader API Not Connected</div>
      <button onClick={handleRefresh} style={{ marginTop: 8, padding: "6px 16px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, color: c.textDim, fontSize: 11, cursor: "pointer", fontFamily: mono }}>↻ Retry</button>
    </div>
  );

  const bal = dashData.balance?.usd ?? 0;
  const gov = dashData.governance ?? {};
  const positions = dashData.positions?.market_positions ?? [];
  const killActive = gov.kill_switch_active || false;
  const dailySpendCents = gov.daily_spend_cents ?? 0;
  const dailyLimitCents = gov.config?.max_daily_spend_cents ?? 1000;
  const drawdownPct = gov.current_drawdown_pct ?? 0;

  return (
    <div style={{ fontFamily: sans, margin: -32, display: "flex", flexDirection: "column", height: "calc(100vh - 72px)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Badge color={dashData.dry_run ? 'warn' : 'danger'}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dashData.dry_run ? c.warn : c.danger, display: "inline-block" }} />
          {dashData.dry_run ? 'Dry Run' : 'Live Trading'}
        </Badge>
        <Badge color="accent">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
          Connected
        </Badge>
        <div style={{ flex: 1 }} />
        <button onClick={handleRefresh} style={{ padding: "4px 12px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 4, color: c.textDim, fontSize: 11, cursor: "pointer", fontFamily: mono }}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 12, overflowX: "auto", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <StatCard label="Balance" value={`$${bal.toFixed(2)}`} />
        <StatCard label="Daily Spend" value={`$${(dailySpendCents/100).toFixed(2)}`} sub={`of $${(dailyLimitCents/100).toFixed(2)} limit`} color={dailySpendCents > dailyLimitCents*0.8 ? c.warn : c.accent} />
        <StatCard label="Drawdown" value={`${(drawdownPct*100).toFixed(1)}%`} sub={`${((gov.config?.drawdown_kill_switch_pct??0.2)*100).toFixed(0)}% kill threshold`} color={drawdownPct > 0.15 ? c.danger : c.accent} />
        <StatCard label="Positions" value={positions.length} sub={`${positions.length} open`} color={c.blue} />
      </div>

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, borderRight: `1px solid ${c.border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${c.border}` }}><SectionLabel left={`Active Positions (${positions.length})`} right={`${positions.length} open`} /></div>
          <PositionsTable positions={positions} />
          <div style={{ padding: 16, display: "flex", gap: 12, borderTop: `1px solid ${c.border}`, marginTop: "auto" }}>
            <RunTradeCycle onComplete={handleRefresh} killActive={killActive} />
            <KillSwitch isActive={killActive} onToggle={handleRefresh} />
          </div>
        </div>
        <div style={{ width: 420, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${c.border}` }}><SectionLabel left="Audit Log" /></div>
          <div style={{ padding: 8, flex: 1, overflowY: "auto" }}><AuditLog refreshKey={refreshKey} /></div>
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${c.border}` }}><SectionLabel left="Recent Trades" /></div>
            <RecentTrades />
          </div>
        </div>
      </div>
    </div>
  );
}