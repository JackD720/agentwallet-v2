const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

// Your supplier directory - in production this comes from your dashboard
const suppliers = {
  chocolate_chips: {
    name: "Barry Callebaut",
    email: "orders@barry-callebaut.com",
    typical_price_per_lb: 4.20,
    min_order_lbs: 500
  },
  flour: {
    name: "King Arthur Baking",
    email: "wholesale@kingarthur.com", 
    typical_price_per_lb: 0.85,
    min_order_lbs: 1000
  },
  packaging: {
    name: "Noissue",
    email: "orders@noissue.co",
    typical_price_per_unit: 0.45,
    min_order_units: 5000
  }
};

async function draftSupplierEmail(supplier, orderDetails, inventoryGap) {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are a procurement agent for BYTE'M, a growing brownie snack brand with HomeGoods and TJX distribution.

Draft a professional supplier email that:
1. States the order quantity needed
2. Asks for their best bulk pricing given our order size
3. Requests confirmation of lead time
4. Mentions we are a growing brand with repeat order potential
5. Is friendly but professional

Supplier: ${supplier.name}
Supplier Email: ${supplier.email}
Typical price: $${supplier.typical_price_per_lb || supplier.typical_price_per_unit} per unit
Order details: ${orderDetails}
Context: We received a PO requiring us to produce ${inventoryGap} additional cases

Return ONLY the email text, starting with Subject: line.`
    }]
  });

  const text = message.content[0].text;
  return text.replace(/```\n?/g, '').trim();
}

async function generateAllSupplierEmails(inventoryReport) {
  console.log("Generating supplier emails based on inventory gaps...\n");
  
  const emails = [];

  // Calculate total production needed
  const totalCasesToProduce = inventoryReport.line_items
    .reduce((sum, item) => sum + item.cases_to_produce, 0);

  if (totalCasesToProduce === 0) {
    console.log("No production needed - all items in stock!");
    return;
  }

  // Draft chocolate chips order
  const chocEmail = await draftSupplierEmail(
    suppliers.chocolate_chips,
    `${totalCasesToProduce * 2} lbs of dark chocolate chips`,
    totalCasesToProduce
  );
  emails.push({ supplier: "Barry Callebaut", email: chocEmail });
  console.log("=== CHOCOLATE CHIPS ORDER ===");
  console.log(chocEmail);
  console.log("\n");

  // Draft packaging order  
  const packEmail = await draftSupplierEmail(
    suppliers.packaging,
    `${totalCasesToProduce * 12} individual brownie bags`,
    totalCasesToProduce
  );
  emails.push({ supplier: "Noissue", email: packEmail });
  console.log("=== PACKAGING ORDER ===");
  console.log(packEmail);
  console.log("\n");

  return emails;
}

module.exports = { generateAllSupplierEmails, draftSupplierEmail };

if (require.main === module) {
  const sampleInventoryReport = {
    po_number: "HG-2026-4471",
    retailer: "HomeGoods",
    line_items: [
      { sku: "BTM-CHOC-2PK", cases_to_produce: 360, status: "PRODUCE_ONLY" },
      { sku: "BTM-BLND-2PK", cases_to_produce: 180, status: "PRODUCE_ONLY" },
      { sku: "BTM-RB-2PK", cases_to_produce: 195, status: "PRODUCE_ONLY" },
    ]
  };

  generateAllSupplierEmails(sampleInventoryReport).catch(console.error);
}
