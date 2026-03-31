import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { inventoryReport, suppliers, brandName, yourName } = req.body;
  if (!inventoryReport || !suppliers) return res.status(400).json({ error: "Missing data" });

  try {
    const totalCases = inventoryReport.total_cases_to_produce;
    if (totalCases === 0) return res.status(200).json({ success: true, data: [] });

    const emailPromises = suppliers.slice(0, 3).map(async supplier => {
      const message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Draft a professional supplier email for ${brandName || "our CPG brand"}.
Supplier: ${supplier.name} (${supplier.email})
Product: ${supplier.product}
Order needed for: ${totalCases} production cases
Typical price: $${supplier.price}/unit
Sender name: ${yourName || "Jack"}
Company: ${brandName || "BYTE'M Brownies"}

Requirements:
- Sign the email with the sender name above (not [Your Name])
- Ask for best bulk pricing given order size
- Request lead time confirmation  
- Mention growing brand with repeat order potential
- Professional but friendly tone

Return ONLY the email starting with Subject: line. No explanation.`
        }]
      });

      return {
        to: supplier.name,
        email: supplier.email,
        qty: `${totalCases} cases`,
        subject: message.content[0].text.split('\n')[0].replace('Subject: ', ''),
        body: message.content[0].text
      };
    });

    const emails = await Promise.all(emailPromises);
    res.status(200).json({ success: true, data: emails });
  } catch (err) {
    res.status(500).json({ error: "Email drafting failed", details: err.message });
  }
}
