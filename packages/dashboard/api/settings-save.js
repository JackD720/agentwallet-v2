// api/settings-save.js
// POST /api/settings-save
// Body: { email, settings: { ...fields } }
// Upserts (insert or update) the settings row for this user.
// No npm deps — uses Supabase REST API directly.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, settings } = req.body;
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({ error: "settings object is required" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase env vars not set" });
  }

  // Strip any fields we never want to overwrite from the client
  const {
    id,
    created_at,
    updated_at,
    email: _email, // exclude — we set it explicitly
    ...settingsToWrite
  } = settings;

  const payload = {
    email,
    ...settingsToWrite,
    // Ensure arrays are passed as proper JSON (not stringified)
    suppliers: Array.isArray(settingsToWrite.suppliers) ? settingsToWrite.suppliers : [],
    recipes: Array.isArray(settingsToWrite.recipes) ? settingsToWrite.recipes : [],
  };

  try {
    const url = `${SUPABASE_URL}/rest/v1/bytem_settings`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        // Upsert: if email already exists, merge (update); otherwise insert
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase error ${response.status}: ${text}`);
    }

    const rows = await response.json();
    return res.status(200).json({ success: true, settings: rows[0] });
  } catch (err) {
    console.error("settings-save error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
