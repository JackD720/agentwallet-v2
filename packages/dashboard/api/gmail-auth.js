// api/gmail-auth.js
// GET /api/gmail-auth?email=jack@bytem.com
// Redirects user to Google OAuth consent screen.
// After consent, Google redirects to /api/gmail-callback.

export default async function handler(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  if (!CLIENT_ID) {
    return res.status(500).json({ error: "GMAIL_CLIENT_ID not set" });
  }

  const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL || "https://agentwallet-dashboard.vercel.app"}/api/gmail-callback`;

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",   // read replies
    "https://www.googleapis.com/auth/gmail.send",       // send emails (future)
    "https://www.googleapis.com/auth/userinfo.email",   // get their Gmail address
  ].join(" ");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: scopes,
    access_type: "offline",     // get refresh token
    prompt: "consent",          // always show consent to get refresh token
    state: email,               // pass user email through OAuth flow
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  res.redirect(authUrl);
}
