export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { parsedPO, inventory, recipes } = req.body;
  if (!parsedPO || !parsedPO.items) return res.status(400).json({ error: "Missing PO data" });

  try {
    // If we have recipes + ingredient inventory, use BOM-based calculation
    if (recipes && recipes.length > 0 && inventory && Object.keys(inventory).length > 0) {
      const ingredientNeeds = {}; // ingredient name -> { needed, onHand, pricePerLb }

      parsedPO.items.forEach(item => {
        const casesOrdered = item.cases || 0;
        // Match PO item to recipe by SKU or name
        const recipe = recipes.find(r =>
          (item.sku && r.sku && item.sku.toLowerCase().includes(r.sku.toLowerCase())) ||
          (item.product_name && r.name && item.product_name.toUpperCase().includes(r.name.toUpperCase().split(" ").slice(-1)[0]))
        ) || recipes[0]; // fallback to first recipe

        if (!recipe) return;
        const unitsPerCase = recipe.unitsPerCase || 6;

        (recipe.ingredients || []).forEach(ing => {
          const key = ing.name;
          const needed = ing.qtyPerUnit * unitsPerCase * casesOrdered;
          if (!ingredientNeeds[key]) {
            const invData = findIngredient(inventory, ing.name);
            ingredientNeeds[key] = {
              name: ing.name,
              unit: ing.unit,
              needed: 0,
              onHand: invData?.onHand || 0,
              pricePerLb: invData?.pricePerLb || 0,
            };
          }
          ingredientNeeds[key].needed += needed;
        });
      });

      const line_items = Object.values(ingredientNeeds).map(ing => ({
        ingredient_name: ing.name,
        unit: ing.unit,
        on_hand: ing.onHand,
        needed: parseFloat(ing.needed.toFixed(2)),
        gap: parseFloat(Math.max(0, ing.needed - ing.onHand).toFixed(2)),
        status: ing.onHand >= ing.needed ? "sufficient" : "order",
        cost_to_order: parseFloat((Math.max(0, ing.needed - ing.onHand) * ing.pricePerLb).toFixed(2)),
        price_per_lb: ing.pricePerLb,
      }));

      const total_cost = line_items.reduce((s, i) => s + i.cost_to_order, 0);

      return res.status(200).json({
        success: true,
        data: {
          mode: "ingredient",
          line_items,
          total_cases_to_produce: parsedPO.items.reduce((s, i) => s + (i.cases || 0), 0),
          total_cost: parseFloat(total_cost.toFixed(2)),
        }
      });
    }

    // Fallback: case-level check (old behavior)
    const caseInventory = inventory || {};
    const line_items = parsedPO.items.map(item => {
      const inv = caseInventory[item.sku] || { cases_on_hand: 0 };
      const cases_on_hand = inv.cases_on_hand || 0;
      const cases_ordered = item.cases || 0;
      return {
        sku: item.sku,
        product_name: item.product_name,
        cases_on_hand,
        cases_ordered,
        cases_to_produce: Math.max(0, cases_ordered - cases_on_hand),
        status: cases_on_hand >= cases_ordered ? "sufficient" : "produce",
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        mode: "cases",
        line_items,
        total_cases_to_produce: line_items.reduce((s, i) => s + (i.cases_to_produce || 0), 0),
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Inventory check failed", details: err.message });
  }
}

function findIngredient(inventory, name) {
  // Try exact match first, then fuzzy
  if (inventory[name]) return inventory[name];
  const nameLower = name.toLowerCase();
  const key = Object.keys(inventory).find(k => 
    k.toLowerCase().includes(nameLower.split(" ")[0]) ||
    nameLower.includes(k.toLowerCase().split(" ")[0])
  );
  return key ? inventory[key] : null;
}
