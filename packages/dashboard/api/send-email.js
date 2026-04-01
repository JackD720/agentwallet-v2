// api/send-email.js
// POST /api/send-email
// Session 3: now also saves email thread to bytem_email_threads for reply tracking.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    to,
    toName,
    subject,
    body,
    fromName,
    userEmail,        // NEW: needed to save thread
    ingredient,       // NEW: ingredient this email is about
    qtyLbs,           // NEW: quantity in lbs
    costEstimate,     // NEW: estimated cost
  } = req.body;

  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SENDGRID_KEY) return res.status(500).json({ error: "SendGrid not configured" });
  if (!to || !subject || !body) return res.status(400).json({ error: "Missing required fields" });

  try {
    // 1. Send via SendGrid
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: toName }] }],
        from: { email: FROM_EMAIL, name: fromName || "byte'm ops" },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });

    if (!sgRes.ok) {
      const err = await sgRes.text();
      return res.status(500).json({ error: "SendGrid error", details: err });
    }

    // 2. Save thread to Supabase for reply tracking (if userEmail provided)
    if (userEmail && SUPABASE_URL) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/bytem_email_threads`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_email: userEmail,
            supplier_name: toName || to,
            supplier_email: to,
            subject,
            ingredient: ingredient || "",
            qty_lbs: parseFloat(qtyLbs) || 0,
            cost_estimate: parseFloat(costEstimate) || 0,
            reply_status: "waiting",
            sent_at: new Date().toISOString(),
          }),
        });
      } catch (threadErr) {
        // Don't fail the send if thread save fails
        console.error("Thread save failed:", threadErr);
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
