export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { parsedPO, inventory } = req.body;
  if (!parsedPO || !inventory) return res.status(400).json({ error: "Missing parsedPO or inventory" });

  try {
    const results = parsedPO.items.map(item => {
      const stock = inventory[item.sku] || { cases_on_hand: 0 };
      const cases_needed = item.cases;
      const cases_available = stock.cases_on_hand;
      const cases_to_produce = Math.max(0, cases_needed - cases_available);
      const status = cases_to_produce === 0 ? "IN_STOCK" : "PRODUCE_ONLY";

      return {
        sku: item.sku,
        product_name: item.product_name,
        cases_ordered: cases_needed,
        cases_on_hand: cases_available,
        cases_to_produce,
        status
      };
    });

    res.status(200).json({
      success: true,
      data: {
        po_number: parsedPO.po_number,
        retailer: parsedPO.retailer,
        delivery_date: parsedPO.delivery_date,
        line_items: results,
        total_cases_to_produce: results.reduce((sum, r) => sum + r.cases_to_produce, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Inventory check failed", details: err.message });
  }
}
