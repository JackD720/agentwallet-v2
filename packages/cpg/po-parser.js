const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

/**
 * Parses incoming PO email content and extracts structured data
 * In production this receives a SendGrid inbound webhook payload
 * In sandbox mode pass a raw email string directly
 */
async function parsePurchaseOrder(emailContent) {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a CPG operations assistant. Extract purchase order details from this email and return ONLY valid JSON with no explanation.

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
}`,
      },
    ],
  });

  try {
    const text = message.content[0].text;
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("Failed to parse PO:", err);
    throw new Error("Could not extract PO data from email");
  }
}

/**
 * Sandbox test - simulates a real HomeGoods PO for BYTE'M
 */
async function testWithSamplePO() {
  const sampleEmail = `
    From: purchasing@homegoods.com
    To: orders@bytem.com
    Subject: Purchase Order #HG-2026-4471

    Dear BYTE'M Team,

    Please find below our purchase order details:

    PO Number: HG-2026-4471
    Order Date: March 28, 2026
    Required Delivery: April 15, 2026

    Items Ordered:
    - SKU: BTM-CHOC-2PK | Chocolate Brownie 2-Pack | 480 cases | 12 units/case
    - SKU: BTM-BLND-2PK | Blonde Brownie 2-Pack | 240 cases | 12 units/case
    - SKU: BTM-RB-2PK | Red Velvet Brownie 2-Pack | 240 cases | 12 units/case

    Ship To: HomeGoods DC, 200 Bald Hill Rd, Warwick RI 02886

    Please confirm receipt of this order.
    HomeGoods Purchasing Team
  `;

  console.log("Testing PO parser with sample HomeGoods order...\n");
  const result = await parsePurchaseOrder(sampleEmail);
  console.log("Parsed PO:", JSON.stringify(result, null, 2));
  return result;
}

module.exports = { parsePurchaseOrder, testWithSamplePO };

// Run test if called directly
if (require.main === module) {
  testWithSamplePO().catch(console.error);
}
