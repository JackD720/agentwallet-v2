// api/settings-get.js
// GET /api/settings-get?email=jack@example.com
// Returns the settings row for this user from Supabase.
// No npm deps — uses Supabase REST API directly.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase env vars not set" });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/bytem_settings?email=eq.${encodeURIComponent(email)}&select=*`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase error ${response.status}: ${text}`);
    }

    const rows = await response.json();

    if (!rows || rows.length === 0) {
      // User doesn't exist yet — return null so frontend shows onboarding
      return res.status(200).json({ settings: null, exists: false });
    }

    const row = rows[0];

    // Parse jsonb arrays (Supabase returns them as objects, not strings)
    return res.status(200).json({
      settings: {
        ...row,
        suppliers: Array.isArray(row.suppliers) ? row.suppliers : [],
        recipes: Array.isArray(row.recipes) ? row.recipes : [],
      },
      exists: true,
    });
  } catch (err) {
    console.error("settings-get error:", err);
    return res.status(500).json({ error: err.message });
  }
}
