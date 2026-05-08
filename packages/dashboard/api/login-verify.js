// api/login-verify.js
// POST /api/login-verify  { token }
// Verifies a magic-link token, marks it used, and returns the email it was issued to.
// The frontend then puts that email into localStorage as the active session.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token is required" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase env vars not set" });
  }

  try {
    // 1. Look up the token.
    const lookupRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_login_tokens?token=eq.${encodeURIComponent(
        token
      )}&select=token,email,expires_at,used`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!lookupRes.ok) {
      const text = await lookupRes.text();
      throw new Error(`Token lookup failed: ${lookupRes.status} ${text}`);
    }

    const rows = await lookupRes.json();
    const row = rows && rows[0];

    if (!row) {
      return res.status(401).json({ error: "Invalid or expired link" });
    }
    if (row.used) {
      return res.status(401).json({ error: "This link has already been used" });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: "This link has expired" });
    }

    // 2. Mark used. We do this BEFORE returning so a replay can't succeed.
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_login_tokens?token=eq.${encodeURIComponent(
        token
      )}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ used: true }),
      }
    );

    if (!patchRes.ok) {
      // Don't surface — if marking-used failed, we still want the user signed in,
      // but log loudly. Worst case the token works again until it expires.
      const text = await patchRes.text();
      console.error("Failed to mark token used:", patchRes.status, text);
    }

    return res.status(200).json({
      success: true,
      email: row.email,
    });
  } catch (err) {
    console.error("login-verify error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
