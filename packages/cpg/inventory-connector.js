/**
 * Inventory Connector
 * Checks current stock against PO requirements
 * Currently uses hardcoded BYTE'M inventory - later connects to Google Sheets or Kaizntree
 */

// Sandbox: hardcoded BYTE'M current inventory
const mockInventory = {
  "BTM-CHOC-2PK": { cases_on_hand: 120, ingredients_for_cases: 800 },
  "BTM-BLND-2PK": { cases_on_hand: 60, ingredients_for_cases: 400 },
  "BTM-RB-2PK": { cases_on_hand: 45, ingredients_for_cases: 300 },
};

function checkInventoryAgainstPO(parsedPO) {
  const results = [];

  for (const item of parsedPO.items) {
    const stock = mockInventory[item.sku] || { cases_on_hand: 0, ingredients_for_cases: 0 };
    const cases_needed = item.cases;
    const cases_available = stock.cases_on_hand;
    const cases_to_produce = Math.max(0, cases_needed - cases_available);
    const can_produce_from_ingredients = stock.ingredients_for_cases;
    const shortfall = Math.max(0, cases_to_produce - can_produce_from_ingredients);

    results.push({
      sku: item.sku,
      product_name: item.product_name,
      cases_ordered: cases_needed,
      cases_on_hand: cases_available,
      cases_to_produce: cases_to_produce,
      can_produce_from_ingredients: can_produce_from_ingredients,
      need_to_order_ingredients_for: shortfall,
      status: shortfall > 0 ? "ORDER_INGREDIENTS" : cases_to_produce > 0 ? "PRODUCE_ONLY" : "IN_STOCK"
    });
  }

  return {
    po_number: parsedPO.po_number,
    retailer: parsedPO.retailer,
    delivery_date: parsedPO.delivery_date,
    line_items: results,
    action_required: results.some(r => r.status === "ORDER_INGREDIENTS")
  };
}

function testInventoryCheck() {
  const samplePO = {
    po_number: "HG-2026-4471",
    retailer: "HomeGoods",
    delivery_date: "2026-04-15",
    items: [
      { sku: "BTM-CHOC-2PK", product_name: "Chocolate Brownie 2-Pack", cases: 480 },
      { sku: "BTM-BLND-2PK", product_name: "Blonde Brownie 2-Pack", cases: 240 },
      { sku: "BTM-RB-2PK", product_name: "Red Velvet Brownie 2-Pack", cases: 240 },
    ]
  };

  console.log("Checking inventory against PO...\n");
  const result = checkInventoryAgainstPO(samplePO);
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- ACTION SUMMARY ---");
  for (const item of result.line_items) {
    console.log(`\n${item.product_name}:`);
    console.log(`  Ordered: ${item.cases_ordered} cases`);
    console.log(`  On hand: ${item.cases_on_hand} cases`);
    console.log(`  Need to produce: ${item.cases_to_produce} cases`);
    console.log(`  Status: ${item.status}`);
    if (item.need_to_order_ingredients_for > 0) {
      console.log(`  ⚠️  Need ingredients for ${item.need_to_order_ingredients_for} additional cases`);
    }
  }
}

module.exports = { checkInventoryAgainstPO };

if (require.main === module) {
  testInventoryCheck();
}
