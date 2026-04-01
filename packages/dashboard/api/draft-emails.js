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
      const relationshipContext = supplier.notes?.trim()
        ? `Relationship notes: ${supplier.notes}`
        : "No prior relationship noted — treat as first contact but keep it warm.";

      const message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Write a SHORT supplier email. Sound like a real founder texting a vendor, not a corporate letter.

Sender: ${yourName || "Jack"}, ${brandName || "BYTE'M"}
Supplier: ${supplier.name}
Product: ${supplier.product}
Quantity: ${totalCases} production cases
Typical unit price: $${supplier.price}
${relationshipContext}

Rules — follow these exactly:
- NEVER start with "I hope this message finds you well" or any filler
- NEVER say "I wanted to reach out" or "I am writing to"
- Open directly with the point or a brief personal line if you have history
- Body: 3 sentences MAX
- If there's relationship history, reference it naturally in one line
- Ask for pricing + lead time in one sentence
- Close warmly but briefly
- Sign: "${yourName || "Jack"}\n${brandName || "BYTE'M"}"

Return ONLY the email starting with "Subject:" — nothing else.`
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
