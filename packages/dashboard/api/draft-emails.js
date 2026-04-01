import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { inventoryReport, suppliers, brandName, yourName } = req.body;
  if (!inventoryReport || !suppliers) return res.status(400).json({ error: "Missing data" });

  try {
    const totalCases = inventoryReport.total_cases_to_produce;
    if (totalCases === 0) return res.status(200).json({ success: true, data: [] });

    const mode = inventoryReport.mode || "cases";
    const ingredientItems = mode === "ingredient"
      ? inventoryReport.line_items.filter(i => i.gap > 0)
      : [];

    const emailPromises = suppliers.slice(0, 3).map(async supplier => {
      const relationshipContext = supplier.notes?.trim()
        ? `Relationship notes: ${supplier.notes}`
        : "No prior relationship noted — treat as first contact but keep it warm.";

      // Find ingredient gaps relevant to this supplier
      let orderDetails = "";
      if (mode === "ingredient" && ingredientItems.length > 0) {
        const relevant = ingredientItems.filter(i =>
          i.ingredient_name.toLowerCase().includes(supplier.product?.toLowerCase().split(" ")[0] || "")
          || supplier.product?.toLowerCase().includes(i.ingredient_name.toLowerCase().split(" ")[0] || "")
        );
        if (relevant.length > 0) {
          orderDetails = relevant.map(i =>
            `${i.gap.toFixed(1)} ${i.unit} of ${i.ingredient_name}`
          ).join(", ");
        } else {
          orderDetails = `${totalCases} production cases worth of ${supplier.product}`;
        }
      } else {
        orderDetails = `${totalCases} production cases`;
      }

      const message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Write a SHORT supplier email. Sound like a real founder texting a vendor, not a corporate letter.

Sender: ${yourName || "Jack"}, ${brandName || "BYTE'M"}
Supplier: ${supplier.name}
Product: ${supplier.product}
Quantity needed: ${orderDetails}
Typical unit price: $${supplier.price}
${relationshipContext}

Rules — follow exactly:
- NEVER start with "I hope this message finds you well" or any filler opener
- NEVER say "I wanted to reach out" or "I am writing to"
- Open directly with the ask or a brief personal line if you have history
- Body: 3 sentences MAX
- Include the specific quantity (in lbs or units as given above)
- Ask for pricing + lead time in one sentence
- Close warmly but briefly
- Sign: "${yourName || "Jack"}\n${brandName || "BYTE'M"}"

Return ONLY the email starting with "Subject:" — nothing else.`
        }]
      });

      return {
        to: supplier.name,
        email: supplier.email,
        qty: orderDetails,
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
