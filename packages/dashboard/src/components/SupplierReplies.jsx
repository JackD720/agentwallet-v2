// src/components/SupplierReplies.jsx
// v2 — auto-expands new replies, draft response button, cleaner UX

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#59E2FD";
const ACCENT_BG = "#f0fcff";
const ACCENT_BORDER = "#c8f4fd";
const DARK = "#1a1a1a";

const STATUS_CONFIG = {
  waiting:    { bg: "#f8f8f8",  border: "#ebebeb", color: "#888",    label: "awaiting reply", icon: "⏳" },
  replied:    { bg: "#fffbeb",  border: "#fde68a", color: "#92400e", label: "reply received", icon: "📨" },
  confirmed:  { bg: "#f0fff4",  border: "#bbf7d0", color: "#166534", label: "confirmed",      icon: "✓"  },
  partial:    { bg: "#fff8ed",  border: "#fde8b0", color: "#92580a", label: "partial",        icon: "~"  },
  rejected:   { bg: "#fff0f0",  border: "#ffd5d5", color: "#c0392b", label: "rejected",       icon: "✕"  },
  needs_info: { bg: "#f5f0ff",  border: "#ddd6fe", color: "#5b21b6", label: "needs info",     icon: "?"  },
  unclear:    { bg: "#f8f8f8",  border: "#ebebeb", color: "#888",    label: "unclear",        icon: "~"  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.waiting;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ThreadCard({ thread, onParse, onDraftResponse, autoExpand }) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [draftingResponse, setDraftingResponse] = useState(false);
  const [responseDraft, setResponseDraft] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Auto-expand when autoExpand prop changes
  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  const parsed = thread.reply_parsed || {};
  const hasReply = thread.reply_status !== "waiting";
  const hasParsed = parsed.status && parsed.status !== "unclear";

  async function draftResponse() {
    setDraftingResponse(true);
    try {
      const res = await fetch("/api/draft-supplier-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread, parsed }),
      });
      const data = await res.json();
      if (data.draft) setResponseDraft(data.draft);
    } catch (err) {
      console.error("Draft response error:", err);
    } finally {
      setDraftingResponse(false);
    }
  }

  async function sendResponse() {
    if (!responseDraft) return;
    setSending(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: thread.supplier_email,
          toName: thread.supplier_name,
          subject: `Re: ${thread.subject}`,
          body: responseDraft,
          fromName: localStorage.getItem("bytem_user_email") || "byte'm ops",
        }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); setConfirmSend(false); }
    } catch (err) {
      console.error("Send response error:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${hasReply ? "#fde68a" : "#ebebeb"}`, borderRadius: 12, overflow: "hidden", marginBottom: 10, transition: "border-color 0.3s" }}>
      {/* Header */}
      <div
        style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, cursor: hasReply ? "pointer" : "default", background: hasReply ? "#fffef5" : "#fafafa" }}
        onClick={() => hasReply && setExpanded(e => !e)}
      >
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#0a7a9a", flexShrink: 0 }}>
          {thread.supplier_name?.[0] || "?"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{thread.supplier_name}</span>
            <StatusBadge status={thread.reply_status} />
          </div>
          <div style={{ fontSize: 11, color: "#bbb" }}>
            {thread.ingredient ? `${thread.ingredient}` : ""}
            {thread.qty_lbs > 0 ? ` · ${thread.qty_lbs.toFixed(1)} lbs` : ""}
            {thread.cost_estimate > 0 ? ` · est. $${thread.cost_estimate.toFixed(2)}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#ccc", marginBottom: 4 }}>
            {hasReply
              ? `replied ${new Date(thread.reply_received_at).toLocaleDateString()}`
              : `sent ${new Date(thread.sent_at).toLocaleDateString()}`}
          </div>
          {hasReply && <div style={{ fontSize: 10, color: "#bbb" }}>{expanded ? "▲" : "▼ view reply"}</div>}
        </div>
      </div>

      {/* Expanded reply content */}
      {hasReply && expanded && (
        <div style={{ borderTop: "1px solid #f5f5f5" }}>
          {/* Raw snippet */}
          {thread.reply_snippet && (
            <div style={{ padding: "12px 16px", background: "#f8f8f8", borderBottom: "1px solid #ebebeb" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Their reply</div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, fontFamily: "'DM Mono', monospace" }}>"{thread.reply_snippet}"</div>
            </div>
          )}

          {/* Parsed data */}
          {hasParsed ? (
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>AI parsed</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  ["Can fulfill", parsed.can_fulfill === true ? "Yes ✓" : parsed.can_fulfill === false ? "No ✕" : "—"],
                  ["Confirmed qty", parsed.confirmed_qty_lbs ? `${parsed.confirmed_qty_lbs} lbs` : "—"],
                  ["Price/lb", parsed.price_per_lb ? `$${parsed.price_per_lb}` : "—"],
                  ["Total price", parsed.total_price ? `$${parsed.total_price.toLocaleString()}` : "—"],
                  ["Lead time", parsed.lead_time_text || (parsed.lead_time_days ? `${parsed.lead_time_days} days` : "—")],
                  ["Payment terms", parsed.payment_terms || "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: "8px 10px", background: "#f8f8f8", borderRadius: 8 }}>
                    <div style={{ fontSize: 9, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{val}</div>
                  </div>
                ))}
              </div>

              {parsed.notes && (
                <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 11, color: "#92400e" }}>
                  <strong>Note:</strong> {parsed.notes}
                </div>
              )}
              {parsed.action_required && (
                <div style={{ marginBottom: 12, padding: "8px 10px", background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 8, fontSize: 11, color: "#0a7a9a" }}>
                  <strong>Action needed:</strong> {parsed.action_required}
                </div>
              )}

              {/* Draft response section */}
              {!sent && (
                <>
                  {!responseDraft ? (
                    <button
                      onClick={draftResponse}
                      disabled={draftingResponse}
                      style={{ width: "100%", padding: "10px", background: draftingResponse ? "#f0f0f0" : DARK, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: draftingResponse ? "#bbb" : "#fff", cursor: draftingResponse ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      {draftingResponse ? "✍ drafting response..." : "✍ draft reply →"}
                    </button>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Drafted response</div>
                      <textarea
                        value={responseDraft}
                        onChange={e => setResponseDraft(e.target.value)}
                        style={{ width: "100%", height: 120, padding: "10px 12px", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 11, fontFamily: "'DM Mono', monospace", color: DARK, background: "#fafafa", resize: "vertical", lineHeight: 1.6, outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={() => setResponseDraft(null)} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #ebebeb", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#888", fontFamily: "inherit" }}>
                          discard
                        </button>
                        <button
                          onClick={sendResponse}
                          disabled={sending}
                          style={{ flex: 1, padding: "8px 14px", background: sending ? "#ddd" : ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, color: sending ? "#999" : DARK, cursor: sending ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif" }}
                        >
                          {sending ? "sending..." : "✓ approve + send"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {sent && (
                <div style={{ padding: "10px 14px", background: "#f0fff4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534", textAlign: "center" }}>
                  ✓ Response sent
                </div>
              )}
            </div>
          ) : (
            thread.reply_status === "replied" && (
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: "#888" }}>Reply received — parse with AI to extract details</div>
                <button onClick={() => onParse(thread)} style={{ padding: "7px 14px", background: ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: DARK, cursor: "pointer", fontFamily: "inherit" }}>
                  Parse reply →
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function SupplierReplies({ userEmail }) {
  const [threads, setThreads] = useState([]);
  const [polling, setPolling] = useState(false);
  const [lastPolled, setLastPolled] = useState(null);
  const [error, setError] = useState(null);
  const [newReplyIds, setNewReplyIds] = useState(new Set());

  async function loadThreads() {
    if (!userEmail) return;
    try {
      const res = await fetch(`/api/get-threads?userEmail=${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.threads) setThreads(data.threads);
      }
    } catch (err) {
      console.error("Load threads error:", err);
    }
  }

  useEffect(() => {
    loadThreads();
  }, [userEmail]);

  async function pollGmail() {
    if (!userEmail) return;
    setPolling(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail-poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail }),
      });
      const data = await res.json();

      if (data.replies?.length > 0) {
        const newIds = new Set();
        for (const reply of data.replies) {
          await fetch("/api/parse-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply, threadDbId: reply.threadDbId, userEmail }),
          });
          newIds.add(reply.threadDbId);
        }
        setNewReplyIds(newIds);
        await loadThreads();
      }
      setLastPolled(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setPolling(false);
    }
  }

  async function parseThread(thread) {
    try {
      await fetch("/api/parse-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: { supplierName: thread.supplier_name, subject: thread.reply_subject, body: thread.reply_snippet, ingredient: thread.ingredient, qtyLbs: thread.qty_lbs },
          threadDbId: thread.id,
          userEmail,
        }),
      });
      await loadThreads();
    } catch (err) {
      console.error("Parse error:", err);
    }
  }

  const waiting = threads.filter(t => t.reply_status === "waiting").length;
  const replied = threads.filter(t => ["replied", "confirmed", "partial", "needs_info"].includes(t.reply_status)).length;
  const confirmed = threads.filter(t => t.reply_status === "confirmed").length;

  return (
    <div>
      {/* Header row with poll button always visible */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            ["Awaiting", waiting, "#888"],
            ["Replied", replied, "#92400e"],
            ["Confirmed", confirmed, "#166534"],
          ].map(([label, count, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color }}>{count}</div>
              <div style={{ fontSize: 9, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {lastPolled && <div style={{ fontSize: 10, color: "#ccc" }}>checked {lastPolled.toLocaleTimeString()}</div>}
          <button
            onClick={pollGmail}
            disabled={polling}
            style={{ padding: "8px 16px", background: polling ? "#f0f0f0" : ACCENT, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: polling ? "#bbb" : DARK, cursor: polling ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
          >
            {polling ? (
              <><div style={{ width: 10, height: 10, border: "2px solid #ccc", borderTopColor: "#888", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />checking...</>
            ) : "↻ check for replies"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", background: "#fff0f0", border: "1px solid #ffd5d5", borderRadius: 8, fontSize: 11, color: "#c0392b", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {threads.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#ccc", fontSize: 12 }}>
          No supplier emails sent yet — run a PO to generate emails
        </div>
      ) : (
        threads.map(thread => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            onParse={parseThread}
            autoExpand={newReplyIds.has(thread.id) || thread.reply_status !== "waiting"}
          />
        ))
      )}
    </div>
  );
}
