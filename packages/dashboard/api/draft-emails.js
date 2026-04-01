import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Map supplier product types to ingredient keys so we can find real quantities
function getRelevantQuantity(supplier, inventoryReport) {
  if (!inventoryReport || inventoryReport.mode !== "ingredient") return null;
  const items = inventoryReport.line_items.filter(i => i.gap > 0);
  if (!items.length) return null;

  const product = (supplier.product || "").toLowerCase();

  // Try to find a matching ingredient
  const match = items.find(i => {
    const ingName = i.ingredient_name.toLowerCase();
    return (
      ingName.includes(product.split(" ")[0]) ||
      product.includes(ingName.split(" ")[0]) ||
      // Special cases
      (product.includes("bag") && ingName.includes("bag")) ||
      (product.includes("packaging") && ingName.includes("bag")) ||
      (product.includes("chocolate") && ingName.includes("chocolate")) ||
      (product.includes("butter") && ingName.includes("butter")) ||
      (product.includes("sugar") && ingName.includes("sugar")) ||
      (product.includes("flour") && ingName.includes("flour")) ||
      (product.includes("egg") && ingName.includes("egg")) ||
      (product.includes("co-pack") && false) // co-packers get cases
    );
  });

  if (match) return `${match.gap.toFixed(1)} ${match.unit} of ${match.ingredient_name}`;

  // Packaging suppliers get bag count (cases × units per case)
  if (product.includes("bag") || product.includes("packaging") || product.includes("pouch")) {
    const totalCases = inventoryReport.total_cases_to_produce;
    // Default 6 units per case — will be overridden by recipe if available
    const unitsPerCase = 6;
    return `${(totalCases * unitsPerCase).toLocaleString()} individual bags`;
  }

  // Co-packers get cases
  if (product.includes("co-pack") || product.includes("production")) {
    return `${inventoryReport.total_cases_to_produce} production cases`;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { inventoryReport, suppliers, brandName, yourName } = req.body;
  if (!inventoryReport || !suppliers) return res.status(400).json({ error: "Missing data" });

  try {
    const totalCases = inventoryReport.total_cases_to_produce;
    if (totalCases === 0) return res.status(200).json({ success: true, data: [] });

    const emailPromises = suppliers.slice(0, 3).map(async supplier => {
      const relationshipContext = supplier.notes?.trim()
        ? `Relationship context: ${supplier.notes}`
        : "First contact — warm but direct.";

      const specificQty = getRelevantQuantity(supplier, inventoryReport)
        || `${totalCases} production cases`;

      const message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 350,
        messages: [{
          role: "user",
          content: `Write a SHORT supplier outreach email. Real founder voice — like a text, not a letter.

From: ${yourName || "Jack"} at ${brandName || "BYTE'M"}
To: ${supplier.name} (${supplier.product})
Order quantity: ${specificQty}
Est. unit price: $${supplier.price}
${relationshipContext}

Hard rules:
- NO "I hope this message finds you well"
- NO "I wanted to reach out" / "I am writing to"
- NO "I hope you're doing well"
- Open with the actual ask or a brief personal reference if you have history
- Body is 2-3 sentences ONLY
- One sentence: what you need and how much
- One sentence: ask for pricing + lead time
- Optional: one sentence on repeat order potential if relevant
- Sign off: "${yourName || "Jack"}, ${brandName || "BYTE'M"}"

Return ONLY the email. First line must be "Subject: ..." — nothing before or after.`
        }]
      });

      const fullText = message.content[0].text;
      const lines = fullText.split('\n');
      const subjectLine = lines.find(l => l.startsWith('Subject:')) || lines[0];
      const subject = subjectLine.replace('Subject:', '').trim();

      return {
        to: supplier.name,
        email: supplier.email,
        qty: specificQty,
        subject,
        body: fullText
      };
    });

    const emails = await Promise.all(emailPromises);
    res.status(200).json({ success: true, data: emails });
  } catch (err) {
    res.status(500).json({ error: "Email drafting failed", details: err.message });
  }
}
