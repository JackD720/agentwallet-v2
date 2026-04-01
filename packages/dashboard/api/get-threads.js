// api/get-threads.js
// GET /api/get-threads?userEmail=jack@bytem.com
// Returns all email threads for a user, sorted newest first.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { userEmail } = req.query;
  if (!userEmail) return res.status(400).json({ error: "userEmail required" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const res2 = await fetch(
      `${SUPABASE_URL}/rest/v1/bytem_email_threads?user_email=eq.${encodeURIComponent(userEmail)}&order=created_at.desc&limit=50`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!res2.ok) {
      const err = await res2.text();
      return res.status(500).json({ error: err });
    }

    const threads = await res2.json();
    return res.status(200).json({ threads });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
