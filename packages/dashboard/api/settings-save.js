// api/settings-save.js
// Uses PATCH to update existing row — avoids duplicate key 409 error.
// Falls back to POST insert if no row exists yet.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, settings } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  if (!settings || typeof settings !== "object") return res.status(400).json({ error: "settings object is required" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase env vars not set" });
  }

  const { id, created_at, updated_at, email: _email, ...settingsToWrite } = settings;

  const payload = {
    ...settingsToWrite,
    suppliers: Array.isArray(settingsToWrite.suppliers) ? settingsToWrite.suppliers : [],
    recipes: Array.isArray(settingsToWrite.recipes) ? settingsToWrite.recipes : [],
  };

  try {
    // Try PATCH first (update existing row)
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_settings?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    if (patchRes.ok) {
      const rows = await patchRes.json();
      // PATCH returns empty array if no row matched — fall through to insert
      if (rows && rows.length > 0) {
        return res.status(200).json({ success: true, settings: rows[0] });
      }
    }

    // No existing row — INSERT
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/bytem_settings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ email, ...payload }),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      throw new Error(`Insert failed ${insertRes.status}: ${text}`);
    }

    const rows = await insertRes.json();
    return res.status(200).json({ success: true, settings: rows[0] });

  } catch (err) {
    console.error("settings-save error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
