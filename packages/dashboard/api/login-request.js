// api/login-request.js
// POST /api/login-request  { email }
// Generates a single-use magic-link token, stores it in Supabase, and emails
// the user a sign-in link. Tokens expire in 15 minutes.
//
// Security notes:
//  - We don't reveal whether an email already has an account (no email enumeration).
//  - The token itself is the bearer credential — never log it.
//  - For a real production launch, add per-IP and per-email rate limiting.

import crypto from "node:crypto";

const TOKEN_TTL_MIN = 15;

function isLikelyEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email: rawEmail } = req.body || {};
  if (!isLikelyEmail(rawEmail)) {
    return res.status(400).json({ error: "Valid email required" });
  }
  const email = rawEmail.trim().toLowerCase();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL;
  const BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://agentwallet-dashboard.vercel.app";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase env vars not set" });
  }
  if (!SENDGRID_KEY || !FROM_EMAIL) {
    return res.status(500).json({ error: "SendGrid env vars not set" });
  }

  try {
    // 1. Generate a high-entropy URL-safe token.
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString();

    // 2. Store it.
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/bytem_login_tokens`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        token,
        email,
        expires_at: expiresAt,
        user_agent: (req.headers["user-agent"] || "").slice(0, 500),
        ip:
          (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
          req.socket?.remoteAddress ||
          "",
      }),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      console.error("login token insert failed:", insertRes.status, text);
      // We deliberately return a generic success message below to avoid leaking state,
      // but bail with 500 if the DB write itself failed — without it the link won't work.
      return res.status(500).json({ error: "Could not start sign-in" });
    }

    // 3. Build the magic link.
    const link = `${BASE_URL}/#login?token=${encodeURIComponent(token)}`;

    // 4. Send via SendGrid.
    const subject = "Your sign-in link for byte'm ops";
    const text = [
      `Hi,`,
      ``,
      `Click the link below to sign in to byte'm ops. This link expires in ${TOKEN_TTL_MIN} minutes and can only be used once.`,
      ``,
      link,
      ``,
      `If you didn't request this, you can ignore this email.`,
      ``,
      `— byte'm ops`,
    ].join("\n");

    const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f8f6;padding:32px;color:#1a1a1a;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #ebebeb;border-radius:14px;padding:32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
      <div style="width:32px;height:32px;border-radius:9px;background:#59E2FD;display:inline-flex;align-items:center;justify-content:center;font-weight:800;">B</div>
      <div style="font-weight:800;letter-spacing:-0.01em;">byte'm ops</div>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">Click the button below to sign in. This link expires in ${TOKEN_TTL_MIN} minutes and can only be used once.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#59E2FD;color:#1a1a1a;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:9px;">Sign in &rarr;</a>
    </p>
    <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">Or paste this URL into your browser:<br><span style="word-break:break-all;color:#666;">${link}</span></p>
    <hr style="border:none;border-top:1px solid #ebebeb;margin:24px 0;" />
    <p style="margin:0;font-size:11px;color:#bbb;">If you didn't request this, you can ignore this email.</p>
  </div>
</body></html>`;

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: FROM_EMAIL, name: "byte'm ops" },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });

    if (!sgRes.ok) {
      const errText = await sgRes.text();
      console.error("SendGrid magic link send failed:", sgRes.status, errText);
      return res.status(500).json({ error: "Could not send sign-in email" });
    }

    return res.status(200).json({ success: true, ttl_minutes: TOKEN_TTL_MIN });
  } catch (err) {
    console.error("login-request error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
