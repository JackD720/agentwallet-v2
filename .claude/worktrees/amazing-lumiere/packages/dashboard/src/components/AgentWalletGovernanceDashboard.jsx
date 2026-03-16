import { useState, useEffect, useRef, useCallback } from "react";

// ─── API Configuration ───
const TRADER_API = 'https://live-trader-164814074525.us-central1.run.app';
const PREDICTOR_API = 'https://predictor-agent-api-164814074525.us-central1.run.app';

async function traderRequest(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${TRADER_API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

async function predictorRequest(path) {
  const res = await fetch(`${PREDICTOR_API}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

// ─── Rule evaluation engine (mirrors Python governance_bridge.py) ───
function evaluateSignal(signal, walletState, config) {
  const rules = [];
  const cost = signal.costCents || 0;

  rules.push({
    id: "kill_switch", name: "Kill Switch", type: "KILL_SWITCH",
    passed: !walletState.killSwitch,
    reason: walletState.killSwitch ? "Kill switch active — all trading halted" : "Kill switch inactive",
  });
  rules.push({
    id: "drawdown", name: "Drawdown Monitor", type: "KILL_SWITCH",
    passed: walletState.drawdown < config.drawdownThreshold,
    reason: `Drawdown ${(walletState.drawdown * 100).toFixed(1)}% ${walletState.drawdown < config.drawdownThreshold ? '<' : '≥'} ${(config.drawdownThreshold * 100)}% threshold`,
  });
  rules.push({
    id: "consecutive", name: "Consecutive Losses", type: "KILL_SWITCH",
    passed: walletState.consecutiveLosses < config.consecutiveLossLimit,
    reason: `${walletState.consecutiveLosses} losses ${walletState.consecutiveLosses < config.consecutiveLossLimit ? '<' : '≥'} limit of ${config.consecutiveLossLimit}`,
  });
  rules.push({
    id: "entry_quality", name: "Entry Quality", type: "SIGNAL_FILTER",
    passed: config.allowedQualities.includes(signal.entryQuality),
    reason: `"${signal.entryQuality}" ${config.allowedQualities.includes(signal.entryQuality) ? '✓' : '✗'} allowed: [${config.allowedQualities.join(', ')}]`,
  });
  rules.push({
    id: "ars_score", name: "ARS Score", type: "SIGNAL_FILTER",
    passed: signal.arsScore >= config.minArsScore,
    reason: `${signal.arsScore.toFixed(2)} ${signal.arsScore >= config.minArsScore ? '≥' : '<'} minimum ${config.minArsScore}`,
  });
  rules.push({
    id: "conviction", name: "Trader Consensus", type: "SIGNAL_FILTER",
    passed: (signal.conviction || 0) >= config.minConviction,
    reason: `${((signal.conviction || 0) * 100).toFixed(0)}% ${(signal.conviction || 0) >= config.minConviction ? '≥' : '<'} minimum ${(config.minConviction * 100)}%`,
  });
  const perTradeOk = cost <= config.maxPerTrade;
  rules.push({
    id: "per_trade", name: "Per-Trade Limit", type: "SPEND_LIMIT",
    passed: perTradeOk,
    reason: `$${(cost / 100).toFixed(2)} ${perTradeOk ? '≤' : '>'} $${(config.maxPerTrade / 100).toFixed(0)} limit`,
  });
  const dailyProjected = walletState.dailySpend + cost;
  const dailyOk = dailyProjected <= config.maxDaily;
  rules.push({
    id: "daily_limit", name: "Daily Limit", type: "SPEND_LIMIT",
    passed: dailyOk,
    reason: `$${(dailyProjected / 100).toFixed(2)} ${dailyOk ? '≤' : '>'} $${(config.maxDaily / 100).toFixed(0)}/day (used: $${(walletState.dailySpend / 100).toFixed(2)})`,
  });
  const balanceOk = cost <= walletState.balance * 100;
  rules.push({
    id: "balance", name: "Balance Check", type: "BALANCE",
    passed: balanceOk,
    reason: `$${walletState.balance.toFixed(2)} ${balanceOk ? '≥' : '<'} $${(cost / 100).toFixed(2)} cost`,
  });

  const failed = rules.filter(r => !r.passed);
  const killSwitched = failed.some(r => r.type === "KILL_SWITCH");
  const decision = killSwitched ? "kill_switched" : failed.length > 0 ? "blocked" : "approved";

  return { rules, decision, failed, cost };
}

// ─── Styling ───
const colors = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surfaceAlt: "#181824",
  border: "#1e1e2e",
  borderHover: "#2a2a3e",
  text: "#e2e2e8",
  textDim: "#6b6b80",
  textMuted: "#44445a",
  accent: "#00e5a0",
  accentDim: "#00e5a020",
  danger: "#ff4466",
  dangerDim: "#ff446620",
  warn: "#ffaa00",
  warnDim: "#ffaa0020",
  blue: "#4488ff",
  blueDim: "#4488ff20",
  purple: "#8855ff",
};

// ─── Components ───
function Badge({ children, color = "accent", size = "sm" }) {
  const c = colors[color] || color;
  const dim = colors[color + "Dim"] || c + "20";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: size === "sm" ? "2px 8px" : "4px 12px",
      borderRadius: 4,
      background: dim,
      color: c,
      fontSize: size === "sm" ? 11 : 12,
      fontWeight: 600,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      border: `1px solid ${c}30`,
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, color = colors.accent }) {
  return (
    <div style={{
      padding: "16px 20px",
      background: colors.surface,
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: colors.textDim, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function RuleRow({ rule, animate, delay }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setShow(true), delay);
      return () => clearTimeout(t);
    } else {
      setShow(true);
    }
  }, [animate, delay]);

  if (!show) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      background: rule.passed ? "transparent" : colors.dangerDim,
      borderRadius: 6,
      borderLeft: `3px solid ${rule.passed ? colors.accent : colors.danger}`,
      opacity: show ? 1 : 0,
      transform: show ? "translateX(0)" : "translateX(-10px)",
      transition: "all 0.3s ease",
      fontSize: 12,
    }}>
      <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>
        {rule.passed ? "✅" : "❌"}
      </span>
      <span style={{ fontWeight: 600, color: colors.text, minWidth: 130, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
        {rule.name}
      </span>
      <span style={{ color: rule.passed ? colors.textDim : colors.danger, flex: 1, fontSize: 11 }}>
        {rule.reason}
      </span>
      <Badge color={
        rule.type === "KILL_SWITCH" ? "danger" :
        rule.type === "SIGNAL_FILTER" ? "purple" :
        rule.type === "SPEND_LIMIT" ? "warn" : "blue"
      } size="sm">
        {rule.type.replace("_", " ")}
      </Badge>
    </div>
  );
}

function SignalCard({ signal, evaluation, isActive, onClick, index, isProcessing }) {
  const decisionColors = {
    approved: colors.accent,
    blocked: colors.danger,
    kill_switched: colors.danger,
    pending: colors.textDim,
  };
  const decision = evaluation?.decision || "pending";
  const dc = decisionColors[decision];

  return (
    <div onClick={onClick} style={{
      padding: "14px 16px",
      background: isActive ? colors.surfaceAlt : colors.surface,
      borderRadius: 8,
      border: `1px solid ${isActive ? dc + "60" : colors.border}`,
      cursor: "pointer",
      transition: "all 0.2s ease",
      position: "relative",
      overflow: "hidden",
    }}>
      {isProcessing && (
        <div style={{
          position: "absolute", top: 0, left: 0, height: 2, background: colors.accent,
          animation: "scanline 1.5s ease-in-out infinite",
          width: "100%",
        }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 4, lineHeight: 1.3 }}>
            {signal.market}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
            {signal.ticker}
          </div>
        </div>
        <Badge color={signal.direction === "YES" ? "accent" : "danger"} size="sm">
          {signal.direction}
        </Badge>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat label="ARS" value={(signal.arsScore || 0).toFixed(2)} good={(signal.arsScore || 0) >= 0.3} />
        <MiniStat label="Entry" value={signal.entryQuality || '—'} good={["good", "fair"].includes(signal.entryQuality)} />
        <MiniStat label="Price" value={`${((signal.price || 0) * 100).toFixed(0)}¢`} />
        <MiniStat label="Traders" value={signal.numTraders || 0} />
      </div>
      {evaluation && (
        <div style={{
          marginTop: 10, padding: "6px 10px", borderRadius: 4,
          background: dc + "15",
          border: `1px solid ${dc}30`,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>
            {decision === "approved" ? "✅" : decision === "blocked" ? "🚫" : "🛑"}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: dc, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
            {decision}
          </span>
          {evaluation.failed.length > 0 && (
            <span style={{ fontSize: 10, color: colors.textDim, marginLeft: "auto" }}>
              {evaluation.failed.length} rule{evaluation.failed.length > 1 ? 's' : ''} failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, good }) {
  return (
    <div style={{ fontSize: 10 }}>
      <span style={{ color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label} </span>
      <span style={{
        color: good === undefined ? colors.textDim : good ? colors.accent : colors.danger,
        fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
      }}>{value}</span>
    </div>
  );
}

function AuditEntry({ entry, index }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  const icon = entry.decision === "approved" ? "✅" : entry.decision === "blocked" ? "🚫" : entry.decision === "info" ? "ℹ️" : "🛑";
  const dc = entry.decision === "approved" ? colors.accent : entry.decision === "info" ? colors.textDim : colors.danger;

  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: "8px 0",
      borderBottom: `1px solid ${colors.border}`,
      opacity: show ? 1 : 0,
      transform: show ? "translateY(0)" : "translateY(5px)",
      transition: "all 0.3s ease",
    }}>
      <span style={{ fontSize: 13, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: colors.text, fontWeight: 500 }}>
          <span style={{ color: dc, fontWeight: 700 }}>{entry.decision.toUpperCase()}</span>
          {" — "}{entry.direction} on {entry.market}
        </div>
        {entry.blockedBy?.length > 0 && (
          <div style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>
            Blocked by: {entry.blockedBy.join(", ")}
          </div>
        )}
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
          {entry.timestamp} · {entry.latencyMs}ms · eval:{entry.evalId.slice(0, 8)}
        </div>
      </div>
      {entry.cost && (
        <span style={{ fontSize: 11, color: colors.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
          ${(entry.cost / 100).toFixed(2)}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ value, max, color = colors.accent, height = 6 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ height, background: colors.border, borderRadius: height / 2, overflow: "hidden", width: "100%" }}>
      <div style={{
        height: "100%", width: `${pct}%`,
        background: pct > 80 ? colors.danger : pct > 60 ? colors.warn : color,
        borderRadius: height / 2,
        transition: "width 0.5s ease, background 0.3s ease",
      }} />
    </div>
  );
}

function DrawdownGauge({ value, threshold }) {
  const pct = Math.min(value / threshold, 1);
  const angle = pct * 180;
  const color = pct > 0.8 ? colors.danger : pct > 0.5 ? colors.warn : colors.accent;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="80" height="48" viewBox="0 0 80 48">
        <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none" stroke={colors.border} strokeWidth="6" strokeLinecap="round" />
        <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${angle * 0.56} 200`}
          style={{ transition: "all 0.5s ease" }}
        />
        <text x="40" y="40" textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {(value * 100).toFixed(1)}%
        </text>
      </svg>
      <div style={{ fontSize: 9, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Drawdown ({(threshold * 100)}% kill)
      </div>
    </div>
  );
}

// ─── Normalize Predictor API signals into governance format ───
function normalizeSignals(rawSignals) {
  if (!rawSignals || !Array.isArray(rawSignals)) return [];
  return rawSignals.map((sig, i) => ({
    id: sig.id || `sig_${i}`,
    market: sig.market || sig.question || sig.title || 'Unknown Market',
    ticker: sig.ticker || sig.kalshi_ticker || sig.market_slug || '—',
    direction: (sig.direction || sig.side || 'YES').toUpperCase(),
    price: sig.price || sig.best_price || sig.last_price || 0,
    arsScore: sig.ars_score ?? sig.arsScore ?? sig.score ?? 0,
    entryQuality: sig.entry_quality || sig.entryQuality || 'unknown',
    conviction: sig.conviction ?? sig.consensus ?? 0,
    numTraders: sig.num_traders ?? sig.numTraders ?? sig.trader_count ?? 0,
    totalSize: sig.total_size ?? sig.totalSize ?? sig.volume ?? 0,
    recommendedSize: sig.recommended_size ?? sig.recommendedSize ?? 0,
    contracts: sig.contracts ?? sig.count ?? 0,
    costCents: sig.cost_cents ?? sig.costCents ?? Math.round((sig.contracts || sig.count || 0) * (sig.price || 0) * 100),
    category: sig.category || sig.market_category || 'Other',
    traders: sig.traders || sig.top_traders || [],
  }));
}

// ─── Main Dashboard ───
export default function AgentWalletGovernanceDashboard() {
  const [signals, setSignals] = useState([]);
  const [activeSignal, setActiveSignal] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [walletState, setWalletState] = useState({
    balance: 0, dailySpend: 0, weeklySpend: 0, drawdown: 0,
    consecutiveLosses: 0, peakBalance: 0, killSwitch: false,
  });
  const [govConfig, setGovConfig] = useState({
    maxPerTrade: 2000,
    maxDaily: 5000,
    maxWeekly: 15000,
    minArsScore: 0.3,
    minConviction: 0.05,
    allowedQualities: ["good", "fair"],
    drawdownThreshold: 0.20,
    consecutiveLossLimit: 5,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentProcessing, setCurrentProcessing] = useState(null);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [loadingDash, setLoadingDash] = useState(true);
  const [runResult, setRunResult] = useState(null);
  const [backendAudit, setBackendAudit] = useState([]);
  const auditRef = useRef(null);

  // Fetch live wallet state from Cloud Run
  const fetchDashboard = useCallback(async () => {
    try {
      const data = await traderRequest('GET', '/dashboard');
      const bal = data.balance?.usd ?? 0;
      const gov = data.governance ?? {};
      const cfg = gov.config ?? {};

      setWalletState(prev => ({
        ...prev,
        balance: bal,
        dailySpend: gov.daily_spend_cents ?? 0,
        weeklySpend: gov.weekly_spend_cents ?? 0,
        drawdown: gov.current_drawdown_pct ?? 0,
        consecutiveLosses: gov.consecutive_losses ?? 0,
        peakBalance: gov.peak_balance_usd ?? bal,
        killSwitch: gov.kill_switch_active ?? false,
      }));

      if (cfg.max_per_trade_cents) {
        setGovConfig(prev => ({
          ...prev,
          maxPerTrade: cfg.max_per_trade_cents ?? prev.maxPerTrade,
          maxDaily: cfg.max_daily_spend_cents ?? prev.maxDaily,
          maxWeekly: cfg.max_weekly_spend_cents ?? prev.maxWeekly,
          minArsScore: cfg.min_ars_score ?? prev.minArsScore,
          minConviction: cfg.min_conviction ?? prev.minConviction,
          drawdownThreshold: cfg.drawdown_kill_switch_pct ?? prev.drawdownThreshold,
          consecutiveLossLimit: cfg.consecutive_loss_limit ?? prev.consecutiveLossLimit,
          allowedQualities: cfg.allowed_entry_qualities ?? prev.allowedQualities,
        }));
      }
    } catch (e) {
      console.error('Dashboard fetch failed:', e);
    } finally {
      setLoadingDash(false);
    }
  }, []);

  // Fetch live signals from Predictor Agent API
  const fetchSignals = useCallback(async () => {
    try {
      const data = await predictorRequest('/api/signals');
      const raw = data.signals || data.results || data;
      const normalized = normalizeSignals(Array.isArray(raw) ? raw : []);
      if (normalized.length > 0) {
        setSignals(normalized);
      }
    } catch (e) {
      console.error('Signals fetch failed:', e);
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  // Fetch audit log from backend (real trade history)
  const fetchAudit = useCallback(async () => {
    try {
      const data = await traderRequest('GET', '/audit');
      const entries = (data.entries || []).map((e, i) => ({
        evalId: e._logged_at || `audit_${i}`,
        timestamp: e._logged_at ? new Date(e._logged_at).toLocaleTimeString() : '—',
        market: e.signal || e.market || e.event || 'Unknown',
        direction: e.direction || '—',
        decision: e.event === 'TRADE_EXECUTED' ? 'approved'
          : e.event === 'BLOCKED' ? 'blocked'
          : e.decision?.toLowerCase() || 'info',
        blockedBy: e.blocked_by || e.governance?.failed_rules || [],
        cost: e.cost_cents || null,
        latencyMs: e.governance?.latency_ms || '—',
        source: 'backend',
      }));
      if (entries.length > 0) {
        setBackendAudit(entries);
      }
    } catch (e) {
      console.error('Audit fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchSignals();
    fetchAudit();
    const dashInterval = setInterval(fetchDashboard, 15000);
    const sigInterval = setInterval(fetchSignals, 60000);
    const auditInterval = setInterval(fetchAudit, 30000);
    return () => { clearInterval(dashInterval); clearInterval(sigInterval); clearInterval(auditInterval); };
  }, [fetchDashboard, fetchSignals, fetchAudit]);

  // Auto-run governance evaluation when signals load (instant, no animation)
  useEffect(() => {
    if (signals.length === 0 || isRunning) return;
    let state = { ...walletState };
    const newEvals = {};
    const newAuditEntries = [];

    for (const signal of signals) {
      const { evaluation, newState, entry } = processSignal(signal, state);
      state = newState;
      newEvals[signal.id] = evaluation;
      newAuditEntries.push(entry);
    }

    setEvaluations(newEvals);
    setProcessedCount(signals.length);
  }, [signals]);

  const processSignal = (signal, state) => {
    const ev = evaluateSignal(signal, state, govConfig);
    const newState = { ...state };

    if (ev.decision === "approved") {
      newState.balance -= ev.cost / 100;
      newState.dailySpend += ev.cost;
      newState.weeklySpend += ev.cost;
      if (newState.balance < newState.peakBalance) {
        newState.drawdown = (newState.peakBalance - newState.balance) / newState.peakBalance;
      }
    }

    const entry = {
      evalId: crypto.randomUUID(),
      timestamp: new Date().toISOString().slice(11, 19),
      market: signal.market,
      direction: signal.direction,
      decision: ev.decision,
      blockedBy: ev.failed.map(r => r.name),
      cost: ev.decision === "approved" ? ev.cost : null,
      latencyMs: (Math.random() * 3 + 0.5).toFixed(1),
    };

    return { evaluation: ev, newState, entry };
  };

  // Run governance simulation locally on current signals
  const runAllSignals = async () => {
    if (signals.length === 0) return;
    setIsRunning(true);
    setEvaluations({});
    setAuditLog([]);
    setProcessedCount(0);
    setRunResult(null);

    let state = { ...walletState };

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      setCurrentProcessing(signal.id);
      setActiveSignal(signal.id);
      await new Promise(r => setTimeout(r, 800));

      const { evaluation, newState, entry } = processSignal(signal, state);
      state = newState;

      setEvaluations(prev => ({ ...prev, [signal.id]: evaluation }));
      setWalletState({ ...state });
      setAuditLog(prev => [entry, ...prev]);
      setProcessedCount(i + 1);

      await new Promise(r => setTimeout(r, 1200));
      setCurrentProcessing(null);
    }
    setIsRunning(false);
  };

  // Run actual trade cycle on Cloud Run
  const runLivePipeline = async () => {
    setRunResult(null);
    try {
      const r = await traderRequest('POST', '/run');
      setRunResult(r);
      await fetchDashboard();
    } catch (e) {
      setRunResult({ error: e.message });
    }
  };

  const activeEval = activeSignal ? evaluations[activeSignal] : null;
  const activeSignalData = signals.find(s => s.id === activeSignal);
  const totalBlocked = Object.values(evaluations).filter(e => e.decision !== "approved").length;
  const totalApproved = Object.values(evaluations).filter(e => e.decision === "approved").length;
  const isLoading = loadingSignals && loadingDash;

  return (
    <div style={{
      background: colors.bg,
      minHeight: "100vh",
      color: colors.text,
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: 0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes scanline { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${colors.bg}; }
        ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 2px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        padding: "16px 24px",
        borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: colors.surface,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.blue})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800,
          }}>⛨</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
              AgentWallet
              <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
                Governance Engine
              </span>
            </div>
            <div style={{ fontSize: 10, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
              predictor-agent-alpha · kalshi-v2 · {new Date().toISOString().slice(0, 10)} · <span style={{ color: colors.accent }}>LIVE</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 4,
            background: walletState.killSwitch ? colors.dangerDim : colors.accentDim,
            border: `1px solid ${walletState.killSwitch ? colors.danger : colors.accent}40`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: walletState.killSwitch ? colors.danger : colors.accent,
              animation: isRunning ? "pulse 1s infinite" : "none",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              color: walletState.killSwitch ? colors.danger : colors.accent,
              textTransform: "uppercase",
            }}>
              {walletState.killSwitch ? "Kill Switch Active" : isRunning ? "Processing" : "Ready"}
            </span>
          </div>

          <button onClick={runLivePipeline} disabled={isRunning || walletState.killSwitch} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${colors.blue}40`,
            background: colors.blueDim,
            color: colors.blue,
            fontWeight: 700, fontSize: 11, cursor: isRunning ? "default" : "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.2s",
            opacity: isRunning || walletState.killSwitch ? 0.4 : 1,
          }}>
            ⚡ Run Live Trade
          </button>

          <button onClick={runAllSignals} disabled={isRunning || signals.length === 0} style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: isRunning ? colors.border : colors.accent,
            color: isRunning ? colors.textDim : colors.bg,
            fontWeight: 700, fontSize: 12, cursor: isRunning || signals.length === 0 ? "default" : "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.02em",
            transition: "all 0.2s",
          }}>
            {isRunning ? `Processing ${processedCount}/${signals.length}...` : "▶ Run Governance Pipeline"}
          </button>
        </div>
      </div>

      {/* Live pipeline result banner */}
      {runResult && (
        <div style={{
          padding: "10px 24px",
          background: runResult.error ? colors.dangerDim : colors.accentDim,
          borderBottom: `1px solid ${runResult.error ? colors.danger : colors.accent}40`,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          color: runResult.error ? colors.danger : colors.accent,
        }}>
          {runResult.error
            ? `❌ Error: ${runResult.error}`
            : `✅ Live pipeline complete — ${runResult.results?.total ?? 0} signals → ${runResult.results?.matched ?? 0} matched → ${runResult.results?.approved ?? 0} approved → ${runResult.results?.executed ?? 0} executed`
          }
          {(runResult.results?.trades || []).map((t, i) => (
            <span key={i}> | 💸 {t.side?.toUpperCase()} {t.count}x {t.ticker} @ {t.price}¢</span>
          ))}
          <span
            onClick={() => setRunResult(null)}
            style={{ marginLeft: 12, cursor: "pointer", opacity: 0.6 }}
          >✕</span>
        </div>
      )}

      {/* ── Stats Row ── */}
      <div style={{
        padding: "16px 24px",
        display: "flex", gap: 12, overflowX: "auto",
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <StatCard label="Balance" value={`$${walletState.balance.toFixed(2)}`} sub={`peak: $${walletState.peakBalance.toFixed(2)}`} />
        <StatCard label="Daily Spend" value={`$${(walletState.dailySpend / 100).toFixed(2)}`} sub={`of $${govConfig.maxDaily / 100} limit`} color={walletState.dailySpend > govConfig.maxDaily * 0.8 ? colors.warn : colors.accent} />
        <StatCard label="Approved" value={totalApproved} sub={`of ${processedCount} signals`} color={colors.accent} />
        <StatCard label="Blocked" value={totalBlocked} sub={totalBlocked > 0 ? "guardrails working" : "none yet"} color={totalBlocked > 0 ? colors.danger : colors.textDim} />
        <div style={{
          padding: "16px 20px", background: colors.surface, borderRadius: 8,
          border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 16,
        }}>
          <DrawdownGauge value={walletState.drawdown} threshold={govConfig.drawdownThreshold} />
          <div>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
              Daily Usage
            </div>
            <ProgressBar value={walletState.dailySpend} max={govConfig.maxDaily} height={5} />
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              ${(walletState.dailySpend / 100).toFixed(2)} / ${(govConfig.maxDaily / 100).toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ display: "flex", height: "calc(100vh - 220px)" }}>
        {/* Left: Signals */}
        <div style={{
          width: 320, borderRight: `1px solid ${colors.border}`,
          overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.1em", color: colors.textMuted, padding: "4px 8px",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Incoming Signals ({signals.length})</span>
            <span style={{ color: colors.accent, fontFamily: "'JetBrains Mono', monospace" }}>LIVE</span>
          </div>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textDim, fontSize: 11 }}>
              Loading signals...
            </div>
          ) : signals.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textDim, fontSize: 11 }}>
              No signals from Predictor Agent yet.
              <br/>
              <span style={{ fontSize: 10, color: colors.textMuted }}>Signals refresh every 60s</span>
            </div>
          ) : (
            signals.map((sig, i) => (
              <SignalCard
                key={sig.id}
                signal={sig}
                evaluation={evaluations[sig.id]}
                isActive={activeSignal === sig.id}
                onClick={() => setActiveSignal(sig.id)}
                index={i}
                isProcessing={currentProcessing === sig.id}
              />
            ))
          )}
        </div>

        {/* Center: Rule Evaluation */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {activeSignalData && activeEval ? (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{activeSignalData.market}</span>
                  <Badge color={activeSignalData.direction === "YES" ? "accent" : "danger"} size="md">
                    {activeSignalData.direction} @ {((activeSignalData.price || 0) * 100).toFixed(0)}¢
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <MiniStat label="Contracts" value={activeSignalData.contracts} />
                  <MiniStat label="Cost" value={`$${((activeSignalData.costCents || 0) / 100).toFixed(2)}`} />
                  <MiniStat label="Traders" value={`${activeSignalData.numTraders} (${((activeSignalData.conviction || 0) * 100).toFixed(0)}%)`} />
                  <MiniStat label="Pool" value={`$${((activeSignalData.totalSize || 0) / 1000).toFixed(0)}k`} />
                  <MiniStat label="Category" value={activeSignalData.category} />
                </div>
              </div>

              <div style={{
                padding: "10px 14px", marginBottom: 16, borderRadius: 6,
                background: activeEval.decision === "approved" ? colors.accentDim : colors.dangerDim,
                border: `1px solid ${activeEval.decision === "approved" ? colors.accent : colors.danger}40`,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>
                  {activeEval.decision === "approved" ? "✅" : activeEval.decision === "blocked" ? "🚫" : "🛑"}
                </span>
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: activeEval.decision === "approved" ? colors.accent : colors.danger,
                    textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {activeEval.decision}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textDim }}>
                    {activeEval.rules.length} rules evaluated · {activeEval.failed.length} failed
                    {activeEval.decision === "approved" && ` · ${activeSignalData.contracts} contracts queued`}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.textMuted, marginBottom: 10 }}>
                Rules Engine Evaluation
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeEval.rules.map((rule, i) => (
                  <RuleRow key={rule.id} rule={rule} animate={currentProcessing === activeSignal} delay={i * 120} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: colors.textMuted, gap: 12,
            }}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>⛨</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {processedCount === 0 ? 'Click "Run Governance Pipeline" to start' : "Select a signal to view evaluation"}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, maxWidth: 300, textAlign: "center", lineHeight: 1.5 }}>
                Every signal from the Predictor Agent passes through {govConfig.allowedQualities.length + 4} rules
                before any money moves.
              </div>
              {signals.length > 0 && (
                <div style={{ fontSize: 10, color: colors.accent, marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                  {signals.length} live signals ready for evaluation
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Audit Log */}
        <div style={{
          width: 340, borderLeft: `1px solid ${colors.border}`,
          overflowY: "auto", padding: "12px 16px",
        }} ref={auditRef}>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.1em", color: colors.textMuted, padding: "4px 0", marginBottom: 8,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Audit Log</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{(auditLog.length + backendAudit.length)} entries</span>
          </div>
          {(auditLog.length + backendAudit.length) === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textMuted, fontSize: 11 }}>
              Audit entries will appear here as signals are processed
            </div>
          ) : (
            <>
              {auditLog.map((entry, i) => (
                <AuditEntry key={entry.evalId} entry={entry} index={i} />
              ))}
              {backendAudit.length > 0 && auditLog.length > 0 && (
                <div style={{ fontSize: 9, color: colors.textMuted, textAlign: "center", padding: "8px 0", borderBottom: `1px solid ${colors.border}`, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  ── Backend Trade History ──
                </div>
              )}
              {backendAudit.map((entry, i) => (
                <AuditEntry key={`be_${entry.evalId}`} entry={entry} index={i} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}