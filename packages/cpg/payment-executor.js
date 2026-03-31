/**
 * Payment Executor
 * Governs all supplier payments through AgentWallet rules
 * Before any payment executes it must pass spend controls
 */

const SPEND_RULES = {
  max_per_transaction: 10000,
  max_per_supplier_monthly: 25000,
  require_approval_above: 5000,
  blocked_suppliers: [],
};

const monthlySpend = {};

function checkSpendRules(supplier, amount) {
  const rules = [];

  // Rule 1: Max per transaction
  rules.push({
    rule: "MAX_TRANSACTION",
    passed: amount <= SPEND_RULES.max_per_transaction,
    reason: `$${amount} vs $${SPEND_RULES.max_per_transaction} limit`
  });

  // Rule 2: Monthly supplier limit
  const currentMonthly = monthlySpend[supplier] || 0;
  rules.push({
    rule: "MONTHLY_SUPPLIER_LIMIT",
    passed: (currentMonthly + amount) <= SPEND_RULES.max_per_supplier_monthly,
    reason: `$${currentMonthly + amount} projected vs $${SPEND_RULES.max_per_supplier_monthly} monthly limit`
  });

  // Rule 3: Approval threshold
  rules.push({
    rule: "APPROVAL_REQUIRED",
    passed: true,
    requires_approval: amount > SPEND_RULES.require_approval_above,
    reason: amount > SPEND_RULES.require_approval_above 
      ? `Amount $${amount} exceeds $${SPEND_RULES.require_approval_above} - human approval required`
      : "Auto-approved"
  });

  // Rule 4: Blocked suppliers
  rules.push({
    rule: "SUPPLIER_ALLOWLIST",
    passed: !SPEND_RULES.blocked_suppliers.includes(supplier),
    reason: SPEND_RULES.blocked_suppliers.includes(supplier) 
      ? `${supplier} is blocked` 
      : `${supplier} is approved`
  });

  const failed = rules.filter(r => !r.passed);
  const needsApproval = rules.some(r => r.requires_approval);
  const decision = failed.length > 0 ? "BLOCKED" : needsApproval ? "PENDING_APPROVAL" : "APPROVED";

  return { rules, decision, failed, amount, supplier };
}

function executePayment(supplier, amount, description) {
  console.log(`\nProcessing payment: $${amount} to ${supplier}`);
  console.log(`Description: ${description}`);
  
  const result = checkSpendRules(supplier, amount);
  
  console.log(`\nGovernance check: ${result.decision}`);
  result.rules.forEach(r => {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${r.rule}: ${r.reason}`);
  });

  if (result.decision === "APPROVED") {
    monthlySpend[supplier] = (monthlySpend[supplier] || 0) + amount;
    console.log(`\n💸 Payment executed: $${amount} to ${supplier}`);
    console.log(`📋 Audit log entry created`);
    return { success: true, decision: "APPROVED", amount, supplier };
  } else if (result.decision === "PENDING_APPROVAL") {
    console.log(`\n⏳ Payment queued for approval: $${amount} to ${supplier}`);
    console.log(`📱 Notification sent to founder`);
    return { success: false, decision: "PENDING_APPROVAL", amount, supplier };
  } else {
    console.log(`\n🚫 Payment blocked: ${result.failed.map(r => r.reason).join(", ")}`);
    return { success: false, decision: "BLOCKED", amount, supplier };
  }
}

function testPaymentExecution() {
  console.log("=== PAYMENT EXECUTOR TEST ===\n");

  // Test 1: Normal approved payment
  executePayment("Barry Callebaut", 4200, "1,470 lbs dark chocolate chips - PO HG-2026-4471");
  
  // Test 2: Large payment needing approval
  executePayment("Noissue", 8500, "8,880 brownie bags - PO HG-2026-4471");

  // Test 3: Payment that exceeds transaction limit
  executePayment("Boston Baking", 15000, "Production run deposit");
}

module.exports = { executePayment, checkSpendRules };

if (require.main === module) {
  testPaymentExecution();
}
