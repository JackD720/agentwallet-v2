// api/fetch-inventory.js
// Now accepts column config from the request body instead of hardcoding B/C/F.
// Falls back to original defaults if not provided.

function colLetterToIndex(letter) {
  // "A"→0, "B"→1, "C"→2 ... "F"→5
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    sheetUrl,
    ingredientCol = "B",   // column with ingredient name
    priceCol = "C",        // column with price per lb
    inventoryCol = "F",    // column with lbs on hand
    headerRow = "4",       // row number of the header row (data starts row+1)
  } = req.body;

  if (!sheetUrl) return res.status(400).json({ error: "Missing sheet URL" });

  const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: "Google Sheets API key not configured" });

  try {
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: "Invalid Google Sheets URL" });
    const sheetId = match[1];

    // Determine range: from first col to last col, starting at headerRow
    const cols = [ingredientCol, priceCol, inventoryCol].map(c => c.toUpperCase());
    const sortedCols = [...cols].sort();
    const firstCol = sortedCols[0];
    const lastCol = sortedCols[sortedCols.length - 1];
    const startRow = parseInt(headerRow) || 4;
    const endRow = startRow + 50; // read up to 50 data rows

    const range = `${firstCol}${startRow}:${lastCol}${endRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Sheets API error", details: err });
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return res.status(200).json({ success: true, data: {} });
    }

    // Map column letters to indices relative to firstCol
    const baseIndex = firstCol.charCodeAt(0) - 65;
    const ingIdx    = ingredientCol.toUpperCase().charCodeAt(0) - 65 - baseIndex;
    const priceIdx  = priceCol.toUpperCase().charCodeAt(0) - 65 - baseIndex;
    const invIdx    = inventoryCol.toUpperCase().charCodeAt(0) - 65 - baseIndex;

    // Row 0 is the header — skip it
    const inventory = {};
    rows.slice(1).forEach(row => {
      const ingredient = row[ingIdx]?.trim();
      if (!ingredient) return;

      const rawPrice = (row[priceIdx] || "0").toString().replace(/[$,]/g, "");
      const pricePerLb = parseFloat(rawPrice) || 0;

      const rawInv = (row[invIdx] || "0").toString().replace(/[$,]/g, "");
      const onHand = parseFloat(rawInv) || 0;

      inventory[ingredient] = { onHand, pricePerLb };
    });

    res.status(200).json({ success: true, data: inventory });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch inventory", details: err.message });
  }
}
