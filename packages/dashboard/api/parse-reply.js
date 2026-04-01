// api/parse-reply.js
// POST /api/parse-reply
// Body: { reply: { supplierName, subject, body, ingredient, qtyLbs }, threadDbId, userEmail }
// Uses Claude to parse a supplier reply into structured data:
// confirmed qty, price, lead time, notes, and overall status.
// Saves parsed result back to Supabase.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { reply, threadDbId, userEmail } = req.body;
  if (!reply || !threadDbId) return res.status(400).json({ error: "reply and threadDbId required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Claude parses the reply
    const prompt = `You are parsing a supplier's email reply to a purchase inquiry from a CPG food brand called byte'm.

We asked ${reply.supplierName} about ordering ${reply.qtyLbs} lbs of ${reply.ingredient}.

Here is their reply:
Subject: ${reply.subject}
Body:
${reply.body}

Extract the following from their reply and respond ONLY with a valid JSON object, no markdown, no explanation:

{
  "status": "confirmed" | "partial" | "rejected" | "needs_info" | "unclear",
  "can_fulfill": true | false,
  "confirmed_qty_lbs": number or null,
  "price_per_lb": number or null,
  "total_price": number or null,
  "lead_time_days": number or null,
  "lead_time_text": "string description of when they can deliver" or null,
  "payment_terms": "string e.g. Net 30" or null,
  "notes": "any important details, conditions, or caveats" or null,
  "action_required": "what the buyer needs to do next" or null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- status "confirmed" = they can fulfill the order at a stated price and qty
- status "partial" = they can fulfill but not the full qty or have conditions
- status "rejected" = they cannot fulfill
- status "needs_info" = they asked a question before committing
- status "unclear" = you cannot determine their intent
- If a number isn't mentioned, use null
- confidence reflects how clearly the reply communicates the above`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { status: "unclear", confidence: "low", notes: rawText };
    }

    // 2. Save parsed result to Supabase
    const newStatus = parsed.status === "confirmed" ? "confirmed"
      : parsed.status === "rejected" ? "rejected"
      : "replied";

    await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_email_threads?id=eq.${threadDbId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reply_status: newStatus,
          reply_parsed: parsed,
        }),
      }
    );

    return res.status(200).json({ success: true, parsed });

  } catch (err) {
    console.error("parse-reply error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
