// api/gmail-callback.js
// GET /api/gmail-callback?code=...&state=email@example.com
// Called by Google after user grants consent.
// Exchanges auth code for access+refresh tokens, saves to Supabase,
// then redirects back to the settings page.

export default async function handler(req, res) {
  const { code, state: userEmail, error } = req.query;

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://agentwallet-dashboard.vercel.app";

  // User denied access
  if (error) {
    return res.redirect(`${BASE_URL}/?gmail=denied#settings`);
  }

  if (!code || !userEmail) {
    return res.redirect(`${BASE_URL}/#settings?gmail=error`);
  }

  const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  const REDIRECT_URI = `${BASE_URL}/api/gmail-callback`;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Exchange auth code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("Token exchange failed:", tokens);
      return res.redirect(`${BASE_URL}/?gmail=error#settings`);
    }

    // 2. Get their Gmail address
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const gmailEmail = profile.email || "";

    // 3. Save tokens to Supabase
    const expiry = Date.now() + (tokens.expires_in * 1000);

    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/bytem_settings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        email: userEmail,
        gmail_connected: true,
        gmail_email: gmailEmail,
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token || "",
        gmail_token_expiry: expiry,
      }),
    });

    if (!saveRes.ok) {
      console.error("Supabase save failed:", await saveRes.text());
      return res.redirect(`${BASE_URL}/?gmail=error#settings`);
    }

    // 4. Redirect back to settings with success
    // Use both hash and query so the Connections component can detect it
    return res.redirect(`${BASE_URL}/?gmail=connected#settings`);

  } catch (err) {
    console.error("Gmail callback error:", err);
    return res.redirect(`${BASE_URL}/#settings?gmail=error`);
  }
}
