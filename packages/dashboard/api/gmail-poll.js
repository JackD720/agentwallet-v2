// api/gmail-poll.js
// POST /api/gmail-poll
// Body: { userEmail }
// Fetches unread emails from the last 7 days, matches them against
// known supplier threads in bytem_email_threads, and returns new replies.
// Also handles token refresh automatically.

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userEmail } = req.body;
  if (!userEmail) return res.status(400).json({ error: "userEmail required" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

  try {
    // 1. Load user settings + tokens from Supabase
    const settingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_settings?email=eq.${encodeURIComponent(userEmail)}&select=gmail_access_token,gmail_refresh_token,gmail_token_expiry,gmail_connected`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const settingsRows = await settingsRes.json();
    const settings = settingsRows[0];

    if (!settings?.gmail_connected || !settings.gmail_access_token) {
      return res.status(200).json({ success: false, error: "Gmail not connected", replies: [] });
    }

    // 2. Refresh token if expired (with 5 min buffer)
    let accessToken = settings.gmail_access_token;
    if (Date.now() > settings.gmail_token_expiry - 300000) {
      const refreshed = await refreshAccessToken(settings.gmail_refresh_token, CLIENT_ID, CLIENT_SECRET);
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        const newExpiry = Date.now() + (refreshed.expires_in * 1000);
        // Save refreshed token
        await fetch(`${SUPABASE_URL}/rest/v1/bytem_settings`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            email: userEmail,
            gmail_access_token: accessToken,
            gmail_token_expiry: newExpiry,
          }),
        });
      }
    }

    // 3. Load open threads (waiting for reply)
    const threadsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_email_threads?user_email=eq.${encodeURIComponent(userEmail)}&reply_status=eq.waiting&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const openThreads = await threadsRes.json();

    if (!openThreads?.length) {
      return res.status(200).json({ success: true, replies: [], message: "No open threads to check" });
    }

    // 4. Search Gmail for replies from supplier emails
    const supplierEmails = [...new Set(openThreads.map(t => t.supplier_email))];
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

    const newReplies = [];

    for (const supplierEmail of supplierEmails) {
      const query = `from:${supplierEmail} after:${sevenDaysAgo}`;
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();

      if (!searchData.messages?.length) continue;

      for (const msg of searchData.messages) {
        // Get full message
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "";
        const from = headers.find(h => h.name === "From")?.value || "";
        const threadId = msgData.threadId || "";
        const snippet = msgData.snippet || "";
        const internalDate = parseInt(msgData.internalDate || "0");

        // Extract body
        let body = "";
        function extractBody(part) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            body = Buffer.from(part.body.data, "base64").toString("utf-8");
          } else if (part.parts) {
            part.parts.forEach(extractBody);
          }
        }
        extractBody(msgData.payload);

        // Match to an open thread by supplier email
        const matchedThread = openThreads.find(t =>
          t.supplier_email.toLowerCase() === supplierEmail.toLowerCase() &&
          t.reply_status === "waiting"
        );

        if (matchedThread) {
          newReplies.push({
            threadDbId: matchedThread.id,
            supplierName: matchedThread.supplier_name,
            supplierEmail,
            subject,
            snippet,
            body,
            gmailMessageId: msg.id,
            gmailThreadId: threadId,
            receivedAt: new Date(internalDate).toISOString(),
            ingredient: matchedThread.ingredient,
            qtyLbs: matchedThread.qty_lbs,
          });

          // Update thread status in Supabase to "replied"
          await fetch(
            `${SUPABASE_URL}/rest/v1/bytem_email_threads?id=eq.${matchedThread.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reply_status: "replied",
                reply_received_at: new Date(internalDate).toISOString(),
                reply_subject: subject,
                reply_snippet: snippet,
                thread_id: threadId,
                message_id: msg.id,
              }),
            }
          );
        }
      }
    }

    return res.status(200).json({ success: true, replies: newReplies });

  } catch (err) {
    console.error("gmail-poll error:", err);
    return res.status(500).json({ success: false, error: err.message, replies: [] });
  }
}
