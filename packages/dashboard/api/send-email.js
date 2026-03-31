export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, toName, subject, body, fromName } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: "Missing required fields" });

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "jack@browniibytes.com";

  if (!SENDGRID_API_KEY) {
    return res.status(200).json({ success: true, demo: true });
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

    const responseText = await response.text();
    console.log("SendGrid status:", response.status);
    console.log("SendGrid response:", responseText);

    if (response.ok) {
      res.status(200).json({ success: true });
    } else {
      res.status(500).json({ error: "SendGrid error", details: responseText });
    }
  } catch (err) {
    console.log("Send error:", err.message);
    res.status(500).json({ error: "Send failed", details: err.message });
  }
}
