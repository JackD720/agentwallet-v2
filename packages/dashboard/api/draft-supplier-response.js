// api/draft-supplier-response.js
// POST /api/draft-supplier-response
// Body: { thread, parsed }
// Uses Claude to draft a professional follow-up response to a supplier reply.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { thread, parsed } = req.body;
  if (!thread) return res.status(400).json({ error: "thread required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    const statusContext = {
      confirmed: "They confirmed they can fulfill the order.",
      partial: "They can partially fulfill the order but not the full quantity.",
      rejected: "They cannot fulfill the order.",
      needs_info: "They need more information before committing.",
      unclear: "Their reply was unclear.",
    }[parsed?.status] || "They replied to the order inquiry.";

    const parsedDetails = parsed ? [
      parsed.confirmed_qty_lbs ? `Confirmed qty: ${parsed.confirmed_qty_lbs} lbs` : null,
      parsed.price_per_lb ? `Price: $${parsed.price_per_lb}/lb` : null,
      parsed.lead_time_text ? `Lead time: ${parsed.lead_time_text}` : null,
      parsed.payment_terms ? `Payment terms: ${parsed.payment_terms}` : null,
      parsed.action_required ? `Action needed: ${parsed.action_required}` : null,
    ].filter(Boolean).join("\n") : "";

    const prompt = `You are writing a brief, professional email reply on behalf of Jack Davis at byte'm Brownies, a CPG snack brand.

Context:
- We asked ${thread.supplier_name} about ordering ${thread.qty_lbs} lbs of ${thread.ingredient || "ingredients"}.
- ${statusContext}
${parsedDetails ? `- Details from their reply:\n${parsedDetails}` : ""}

Write a SHORT, professional follow-up email (3-5 sentences max). 
- If they confirmed: thank them, confirm the order details, and ask for next steps (PO, invoice, etc.)
- If they need info: provide what they asked for or ask what specific info they need
- If they can partially fulfill: ask if they can suggest an alternative or timeline for the rest
- If they rejected: thank them and let them know we'll look elsewhere

Tone: friendly, direct, professional. Sign off as "Jack Davis, byte'm".
Do NOT include a subject line. Just the email body.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const draft = claudeData.content?.[0]?.text || "";

    return res.status(200).json({ success: true, draft });
  } catch (err) {
    console.error("draft-supplier-response error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
