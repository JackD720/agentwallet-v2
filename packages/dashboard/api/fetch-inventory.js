export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sheetUrl } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: "Missing sheet URL" });

  const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: "Google Sheets API key not configured" });

  try {
    // Extract sheet ID from URL
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: "Invalid Google Sheets URL" });
    const sheetId = match[1];

    // Fetch columns B (ingredient) and F (on hand) and C (price), starting row 5
    const range = "B4:F20";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Sheets API error", details: err });
    }

    const data = await response.json();
    const rows = data.values || [];

    // Row 0 is headers (B4:F4), skip it
    const inventory = {};
    rows.slice(1).forEach(row => {
      const ingredient = row[0]?.trim(); // Column B
      const pricePerLb = parseFloat((row[1] || "0").replace("$", "")); // Column C
      const onHand = parseFloat(row[4] || 0); // Column F
      if (ingredient) {
        inventory[ingredient] = { onHand, pricePerLb };
      }
    });

    res.status(200).json({ success: true, data: inventory });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch inventory", details: err.message });
  }
}
