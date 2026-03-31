import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { emailContent } = req.body;
  if (!emailContent) return res.status(400).json({ error: "No email content provided" });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a CPG operations assistant. Extract purchase order details from this email and return ONLY valid JSON with no explanation, no markdown, no code fences.

Email content:
${emailContent}

Return this exact structure:
{
  "po_number": "string",
  "retailer": "string",
  "order_date": "string",
  "delivery_date": "string",
  "items": [
    {
      "sku": "string",
      "product_name": "string",
      "cases": number,
      "units_per_case": number,
      "total_units": number
    }
  ],
  "total_cases": number,
  "shipping_address": "string",
  "special_instructions": "string or null"
}`
      }]
    });

    const text = message.content[0].text;
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean);
    res.status(200).json({ success: true, data: parsed });
  } catch (err) {
    console.error("PO parse error:", err);
    res.status(500).json({ error: "Failed to parse PO", details: err.message });
  }
}
