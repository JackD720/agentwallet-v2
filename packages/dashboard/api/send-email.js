export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, toName, subject, body, fromName } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: "Missing required fields" });

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "ops@bytem.co";

  if (!SENDGRID_API_KEY) {
    // Demo mode - simulate send
    console.log(`[DEMO] Would send email to ${to}: ${subject}`);
    return res.status(200).json({ success: true, demo: true, message: "Demo mode — add SENDGRID_API_KEY to send real emails" });
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: toName }] }],
        from: { email: FROM_EMAIL, name: fromName || "BYTE'M Brownies" },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });

    if (response.ok) {
      res.status(200).json({ success: true });
    } else {
      const err = await response.text();
      res.status(500).json({ error: "SendGrid error", details: err });
    }
  } catch (err) {
    res.status(500).json({ error: "Send failed", details: err.message });
  }
}
