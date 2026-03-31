/**
 * Live Feed Dashboard
 * Matches Governance Engine design system exactly
 */
import { useState, useEffect, useCallback } from "react";

const API_BASE = 'https://live-trader-164814074525.us-central1.run.app';

async function apiRequest(method, path) {
  const res = await fetch(`${API_BASE}${path}`, { method });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

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

function StatCard({ label, value, color = c.accent }) {
  return (
    <div style={{
      padding: "16px 20px", background: c.surface,
      borderRadius: 8, border: `1px solid ${c.border}`, minWidth: 120, flex: 1,
    }}>
      <div style={{ fontSize: 11, color: c.textDim, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: mono, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

// ─── Feed Item ───
function FeedItem({ item }) {
  const configs = {
    trade_executed: { color: c.accent, label: "EXECUTED" },
    signal_blocked: { color: c.danger, label: "BLOCKED" },
    kill_switch: { color: c.warn, label: "KILL SWITCH" },
    run_summary: { color: c.blue, label: "CYCLE" },
  };
  const cfg = configs[item.type] || configs.run_summary;

  const timeAgo = (ts) => {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, width: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
        <div style={{ width: 1, flex: 1, background: `${cfg.color}30`, marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Badge color={item.type === 'trade_executed' ? 'accent' : item.type === 'signal_blocked' ? 'danger' : item.type === 'kill_switch' ? 'warn' : 'blue'}>
            {cfg.label}
          </Badge>
          <span style={{ fontSize: 10, color: c.textMuted, fontFamily: mono }}>{timeAgo(item.timestamp)}</span>
        </div>
        <div style={{ fontSize: 13, color: c.text, lineHeight: 1.4, fontWeight: 500 }}>{item.headline}</div>
        {item.market && (
          <div style={{ fontSize: 11, color: c.textDim, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.direction && <span style={{ color: item.direction === 'YES' ? c.accent : c.danger, fontWeight: 600, fontFamily: mono }}>{item.direction}</span>}
            {item.direction && ' on '}
            <span>"{item.market}"</span>
          </div>
        )}
        {item.blocked_by?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            {item.blocked_by.map((rule, i) => (
              <span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: c.dangerDim, color: c.danger, fontFamily: mono, border: `1px solid ${c.danger}20` }}>{rule}</span>
            ))}
          </div>
        )}
        {item.type === 'run_summary' && (
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11 }}>
            <span style={{ color: c.textDim }}>Signals: <span style={{ color: c.text, fontWeight: 600 }}>{item.signals_found}</span></span>
            <span style={{ color: c.accent }}>✓ {item.approved}</span>
            <span style={{ color: c.danger }}>✗ {item.blocked}</span>
            {item.executed > 0 && <span style={{ color: c.blue }}>⚡ {item.executed}</span>}
          </div>
        )}
        {item.rules_checked > 0 && <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{item.rules_checked} rules{item.rules_failed > 0 && ` · ${item.rules_failed} failed`}</div>}
      </div>
    </div>
  );
}

// ─── Tweet Card ───
function TweetCard({ tweet }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(tweet.tweet); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ background: c.surface, borderRadius: 8, border: `1px solid ${c.border}`, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderBottom: expanded ? `1px solid ${c.border}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🐦</span>
          <span style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>{tweet.type === 'blocked_spotlight' ? 'Blocked Spotlight' : 'Daily Recap'}</span>
          <span style={{ fontSize: 10, color: c.textMuted, fontFamily: mono }}>{tweet.char_count}c</span>
          {tweet.char_count > 280 && <Badge color="warn">LONG</Badge>}
        </div>
        <span style={{ fontSize: 12, color: c.textMuted }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: 14 }}>
          <div style={{ background: c.bg, borderRadius: 6, padding: 14, border: `1px solid ${c.border}`, fontSize: 12, color: c.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{tweet.tweet}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleCopy} style={{ padding: "6px 12px", borderRadius: 4, border: "none", background: copied ? c.accentDim : c.surfaceAlt, color: copied ? c.accent : c.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: mono }}>{copied ? '✓ Copied' : '⎘ Copy'}</button>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet.tweet)}`} target="_blank" rel="noopener noreferrer" style={{ padding: "6px 12px", borderRadius: 4, border: "none", background: c.blueDim, color: c.blue, textDecoration: "none", fontSize: 11, fontWeight: 600, fontFamily: mono }}>↗ Post</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ───
export default function LiveFeedDashboard() {
  const [feed, setFeed] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tweets, setTweets] = useState([]);
  const [tweetStats, setTweetStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tweetLoading, setTweetLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchFeed = useCallback(async () => {
    try { const data = await apiRequest('GET', '/public/feed?limit=30'); setFeed(data.feed||[]); setSummary(data.summary||null); setError(null); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  const fetchTweets = useCallback(async () => {
    setTweetLoading(true);
    try { const data = await apiRequest('GET', '/public/tweet'); setTweets(data.tweets||[]); setTweetStats(data.stats||null); }
    catch {} finally { setTweetLoading(false); }
  }, []);

  useEffect(() => { fetchFeed(); fetchTweets(); }, [fetchFeed, fetchTweets]);
  useEffect(() => { if (!autoRefresh) return; const i = setInterval(fetchFeed, 30000); return () => clearInterval(i); }, [autoRefresh, fetchFeed]);

  return (
    <div style={{ fontFamily: sans, margin: -32, display: "flex", flexDirection: "column", height: "calc(100vh - 72px)" }}>
      {/* ── Header ── */}
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={() => { fetchFeed(); fetchTweets(); }} style={{ padding: "4px 12px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 4, color: c.textDim, fontSize: 11, cursor: "pointer", fontFamily: mono }}>
          ↻ Refresh
        </button>
        <button onClick={() => setAutoRefresh(!autoRefresh)} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: autoRefresh ? c.accentDim : c.surfaceAlt, color: autoRefresh ? c.accent : c.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: mono }}>
          {autoRefresh ? '● LIVE' : '○ PAUSED'}
        </button>
        <div style={{ flex: 1 }} />
        {summary && (
          <span style={{ fontSize: 10, color: c.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Kill Switch: <span style={{ color: summary.kill_switch === 'ACTIVE' ? c.danger : c.accent, fontFamily: mono, fontWeight: 600 }}>{summary.kill_switch || 'OFF'}</span>
          </span>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 12, overflowX: "auto", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <StatCard label="Signals Processed" value={summary?.total_signals_processed ?? 0} color={c.text} />
        <StatCard label="Approved" value={summary?.total_approved ?? 0} color={c.accent} />
        <StatCard label="Blocked" value={summary?.total_blocked ?? 0} color={c.danger} />
        <StatCard label="Approval Rate" value={summary?.approval_rate ?? '0%'} color={c.blue} />
      </div>

      {error && (
        <div style={{ padding: "10px 24px", background: c.dangerDim, color: c.danger, fontSize: 11, borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
          Feed unavailable: {error}
        </div>
      )}

      {/* ── Main Content ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left — Activity Feed */}
        <div style={{ flex: 1, borderRight: `1px solid ${c.border}`, overflowY: "auto", padding: "0 20px" }}>
          <div style={{ padding: "12px 0" }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: c.textMuted, display: "flex", justifyContent: "space-between" }}>
              <span>Activity Feed</span>
              <span style={{ fontFamily: mono }}>{feed.length} events</span>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: c.textMuted, fontSize: 11 }}>Loading…</div>
          ) : feed.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: c.textMuted }}>
              <div style={{ fontSize: 40, opacity: 0.2 }}>⚡</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>No activity yet</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>Run a trade cycle to see events here</div>
            </div>
          ) : (
            feed.map((item, i) => <FeedItem key={`${item.type}-${item.timestamp}-${i}`} item={item} />)
          )}
        </div>

        {/* Right — Tweet Generator */}
        <div style={{ width: 380, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: c.textMuted }}>Tweet Generator</span>
            <button onClick={fetchTweets} style={{ background: "transparent", border: "none", color: c.textMuted, fontSize: 10, cursor: "pointer", fontFamily: mono }}>
              {tweetLoading ? '⟳' : '↻'} Regenerate
            </button>
          </div>

          <div style={{ padding: 12, flex: 1, overflowY: "auto" }}>
            {/* Stats Grid */}
            {tweetStats && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 8, overflow: "hidden", marginBottom: 12, border: `1px solid ${c.border}` }}>
                {[
                  { label: 'Recent Trades', value: tweetStats.recent_trades, color: c.accent },
                  { label: 'Recent Blocks', value: tweetStats.recent_blocks, color: c.danger },
                  { label: 'Total Approved', value: tweetStats.lifetime_approved, color: c.text },
                  { label: 'Total Blocked', value: tweetStats.lifetime_blocked, color: c.text },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: c.surface }}>
                    <div style={{ fontSize: 10, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: mono }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tweets */}
            {tweets.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30, color: c.textMuted }}>
                <div style={{ fontSize: 24, opacity: 0.2, marginBottom: 8 }}>🐦</div>
                <div style={{ fontSize: 11 }}>No tweets to generate</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>Run trade cycles first</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tweets.map((tweet, i) => <TweetCard key={i} tweet={tweet} />)}
              </div>
            )}

            {/* Tip */}
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 6, background: c.surfaceAlt, border: `1px solid ${c.border}`, fontSize: 10, color: c.textMuted, lineHeight: 1.5 }}>
              <span style={{ color: c.textDim, fontWeight: 600 }}>Tip: </span>
              Screenshot the activity feed + pair with a generated tweet for maximum engagement.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}