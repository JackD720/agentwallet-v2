/**
 * AgentWallet MCP Server v2
 *
 * Tools:
 *   authorize_spend       — run a transaction through the rules engine
 *   set_rule              — add a governance rule to a wallet
 *   kill_switch           — emergency stop, configure triggers, or reset
 *   get_audit_log         — query the immutable audit trail
 *   get_wallet_status     — balance + active rules + kill switch state
 *   list_agents           — list agents under your owner key
 *   create_agent          — provision a new governed agent
 *   spawn_agent           — spawn a child agent with inherited policy
 *   terminate_agent       — terminate an agent and optionally all children
 *   get_lineage           — visualize the agent family tree
 *   get_compliance_report — SOC2-style compliance summary
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.AGENTWALLET_API_URL || 'http://localhost:3000';
const API_KEY  = process.env.AGENTWALLET_API_KEY;

if (!API_KEY) {
  console.error('[AgentWallet MCP] ERROR: AGENTWALLET_API_KEY is required');
  process.exit(1);
}

async function apiFetch(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`AgentWallet API ${method} ${path} → ${res.status}: ${json.error || text}`);
  }
  return json;
}

function fmt(obj) { return JSON.stringify(obj, null, 2); }

function txSummary(tx, ruleEval) {
  const lines = [
    `Status:    ${tx.status}`,
    `Amount:    $${tx.amount}`,
    `Category:  ${tx.category || 'unspecified'}`,
    `Tx ID:     ${tx.id}`,
    `Wallet:    ${tx.walletId}`,
    `Timestamp: ${tx.createdAt}`,
  ];
  if (ruleEval) {
    if (ruleEval.killSwitched) lines.push('\n⛔ KILL SWITCH ACTIVE — all transactions blocked');
    if (ruleEval.results?.length) {
      const failed = ruleEval.results.filter(r => !r.passed);
      if (failed.length) {
        lines.push('\nFailed rules:');
        failed.forEach(r => lines.push(`  • [${r.ruleType}] ${r.reason}`));
      }
      if (ruleEval.requiresApproval) lines.push('\n⚠️  Requires human approval');
    }
  }
  return lines.join('\n');
}

const server = new McpServer({ name: 'agentwallet', version: '2.0.0' });

// ═══════════════════════════════════════════════════════
// TOOL: authorize_spend
// ═══════════════════════════════════════════════════════
server.tool(
  'authorize_spend',
  `Run a financial transaction through AgentWallet's governance engine.
Every spend is evaluated against the wallet's active rules before money moves.
Returns approved/rejected status and which rules fired.`,
  {
    wallet_id: z.string().describe('The wallet ID to spend from.'),
    amount: z.number().positive().describe('Transaction amount in USD.'),
    category: z.string().optional().describe('Spend category e.g. "llm-inference", "trading", "api-call"'),
    description: z.string().optional().describe('Human-readable description of the payment.'),
    recipient_id: z.string().optional().describe('Recipient identifier for whitelist/blacklist rules.'),
    metadata: z.record(z.unknown()).optional().describe('Extra context for rule evaluation.'),
  },
  async ({ wallet_id, amount, category, description, recipient_id, metadata }) => {
    const payload = {
      walletId: wallet_id, amount,
      ...(category && { category }),
      ...(description && { description }),
      ...(recipient_id && { recipientId: recipient_id }),
      ...(metadata && { metadata }),
    };
    let result; let isError = false;
    try {
      result = await apiFetch('POST', '/api/transactions', payload);
    } catch (err) {
      const msg = err.message || '';
      const jsonStart = msg.indexOf('{');
      if (jsonStart !== -1) {
        try { result = JSON.parse(msg.slice(msg.indexOf(':') + 1).trim()); } catch { /* fall through */ }
      }
      if (!result) return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      isError = true;
    }
    const tx = result.transaction;
    const eval_ = result.ruleEvaluation;
    const summary = tx ? txSummary(tx, eval_) : result.message || fmt(result);
    const blocks = [{ type: 'text', text: summary }];
    if (eval_?.results?.length) {
      blocks.push({ type: 'text', text: '\nFull rule evaluation:\n' + fmt(eval_.results) });
    }
    return { content: blocks, isError };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: set_rule
// ═══════════════════════════════════════════════════════
server.tool(
  'set_rule',
  `Add a governance rule to a wallet.

Rule types:
  PER_TRANSACTION_LIMIT  → { limit: 100 }
  DAILY_LIMIT            → { limit: 500 }
  WEEKLY_LIMIT           → { limit: 2000 }
  MONTHLY_LIMIT          → { limit: 5000 }
  CATEGORY_WHITELIST     → { categories: ["hosting","software"] }
  CATEGORY_BLACKLIST     → { categories: ["gambling"] }
  RECIPIENT_WHITELIST    → { recipients: ["stripe","openai"] }
  RECIPIENT_BLACKLIST    → { recipients: ["bad-vendor"] }
  TIME_WINDOW            → { startHour: 9, endHour: 17 }
  REQUIRES_APPROVAL      → { threshold: 500 }`,
  {
    wallet_id: z.string().describe('Wallet to apply this rule to.'),
    rule_type: z.enum([
      'PER_TRANSACTION_LIMIT','DAILY_LIMIT','WEEKLY_LIMIT','MONTHLY_LIMIT',
      'CATEGORY_WHITELIST','CATEGORY_BLACKLIST','RECIPIENT_WHITELIST',
      'RECIPIENT_BLACKLIST','TIME_WINDOW','REQUIRES_APPROVAL',
    ]).describe('The governance rule type.'),
    parameters: z.record(z.unknown()).describe('Rule parameters — shape depends on rule_type.'),
    priority: z.number().int().min(0).max(1000).optional().describe('Evaluation priority (higher = first). Default 0.'),
  },
  async ({ wallet_id, rule_type, parameters, priority }) => {
    const result = await apiFetch('POST', '/api/rules', {
      walletId: wallet_id, ruleType: rule_type, parameters,
      ...(priority !== undefined && { priority }),
    });
    const rule = result.rule;
    return { content: [{ type: 'text', text: [
      `✅ Rule created`,
      `Rule ID:    ${rule.id}`,
      `Type:       ${rule.ruleType}`,
      `Parameters: ${fmt(rule.parameters)}`,
      `Priority:   ${rule.priority}`,
    ].join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: kill_switch
// ═══════════════════════════════════════════════════════
server.tool(
  'kill_switch',
  `Control the kill switch — your circuit breaker for when things go wrong.

Modes:
  "emergency"  — immediately freeze wallet and halt agent NOW
  "configure"  — set automatic trigger (drawdown %, loss amount, etc.)
  "reset"      — re-enable after reviewing

Trigger types for configure mode:
  DRAWDOWN_PERCENT    — threshold: 0.20 = stop at 20% drawdown
  LOSS_AMOUNT         — threshold: 100 = stop if losses > $100
  CONSECUTIVE_LOSSES  — threshold: 5 = stop after 5 losses in a row
  DAILY_LOSS_LIMIT    — threshold: 50 = stop if daily losses > $50`,
  {
    mode: z.enum(['emergency', 'configure', 'reset']).describe('emergency=freeze now, configure=set trigger, reset=re-enable'),
    wallet_id: z.string().describe('Target wallet ID.'),
    reason: z.string().optional().describe('[emergency] Why you are stopping this agent.'),
    trigger_type: z.enum(['DRAWDOWN_PERCENT','LOSS_AMOUNT','CONSECUTIVE_LOSSES','DAILY_LOSS_LIMIT']).optional(),
    threshold: z.number().optional().describe('[configure] Numeric threshold.'),
    window_hours: z.number().int().optional().describe('[configure] Lookback window in hours. Default 24.'),
    kill_switch_id: z.string().optional().describe('[reset] Kill switch ID to reset.'),
  },
  async ({ mode, wallet_id, reason, trigger_type, threshold, window_hours, kill_switch_id }) => {
    if (mode === 'emergency') {
      const result = await apiFetch('POST', `/api/killswitch/emergency/${wallet_id}`, { reason });
      return { content: [{ type: 'text', text: [
        `⛔ EMERGENCY STOP ACTIVATED`,
        `Wallet: ${result.walletId}  →  ${result.walletStatus}`,
        `Agent:  ${result.agentStatus}`,
        `Reason: ${result.reason}`,
        '', 'Use mode="reset" with kill_switch_id from get_wallet_status to re-enable.',
      ].join('\n') }] };
    }
    if (mode === 'configure') {
      if (!trigger_type || threshold === undefined) throw new Error('configure mode requires trigger_type and threshold');
      const result = await apiFetch('POST', '/api/killswitch', {
        walletId: wallet_id, triggerType: trigger_type, threshold,
        ...(window_hours !== undefined && { windowHours: window_hours }),
      });
      const ks = result.killSwitch;
      return { content: [{ type: 'text', text: [
        `✅ Kill switch configured`,
        `Kill Switch ID: ${ks.id}`,
        `Trigger:        ${ks.triggerType}`,
        `Threshold:      ${ks.threshold}`,
        `Window:         ${ks.windowHours}h`,
        `Status:         ${ks.triggered ? '⛔ TRIGGERED' : '🟢 Armed'}`,
        '', `Description: ${result.description}`,
      ].join('\n') }] };
    }
    if (mode === 'reset') {
      if (!kill_switch_id) throw new Error('reset mode requires kill_switch_id');
      const result = await apiFetch('POST', `/api/killswitch/${kill_switch_id}/reset`, {});
      return { content: [{ type: 'text', text: [
        `✅ Kill switch reset`,
        `Wallet status: ${result.walletStatus}`,
        'Transactions are unblocked.',
      ].join('\n') }] };
    }
    throw new Error(`Unknown mode: ${mode}`);
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: get_audit_log
// ═══════════════════════════════════════════════════════
server.tool(
  'get_audit_log',
  `Query the immutable audit trail for an agent.
Every transaction attempt, rule evaluation, and kill switch trigger is logged here.

Modes:
  "logs"              — raw event stream
  "summary"           — aggregate counts by action/decision
  "compliance_report" — full SOC2-ready report with recommendations`,
  {
    agent_id: z.string().describe('Agent ID to fetch audit logs for.'),
    mode: z.enum(['logs', 'summary', 'compliance_report']).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    from: z.string().optional().describe('ISO timestamp — only return logs after this date.'),
    to: z.string().optional(),
    action_filter: z.enum([
      'TRANSACTION_REQUESTED','TRANSACTION_APPROVED','TRANSACTION_REJECTED',
      'TRANSACTION_EXECUTED','KILL_SWITCH_TRIGGERED','KILL_SWITCH_RESET',
      'RULE_CREATED','RULE_UPDATED','RULE_DELETED',
    ]).optional(),
    decision_filter: z.enum(['ALLOWED','BLOCKED','ESCALATED','SYSTEM']).optional(),
    days: z.number().int().min(1).max(365).optional(),
  },
  async ({ agent_id, mode = 'logs', limit, from, to, action_filter, decision_filter, days }) => {
    if (mode === 'summary') {
      const params = new URLSearchParams({ days: days || 7 });
      const result = await apiFetch('GET', `/api/audit/summary/${agent_id}?${params}`);
      return { content: [{ type: 'text', text: [
        `Audit summary — ${result.agentName} (${result.period.days}d)`,
        `Total actions:    ${result.summary.totalActions}`,
        `Blocked:          ${result.summary.blockedActions} (${result.summary.blockRate})`,
        `Escalated:        ${result.summary.escalatedActions}`,
        `Kill sw triggers: ${result.summary.killSwitchTriggers}`,
        '', 'By action:', ...Object.entries(result.byAction).map(([k,v]) => `  ${k}: ${v}`),
        '', 'By decision:', ...Object.entries(result.byDecision).map(([k,v]) => `  ${k}: ${v}`),
      ].join('\n') }] };
    }
    if (mode === 'compliance_report') {
      const params = new URLSearchParams({ days: days || 30 });
      const r = await apiFetch('GET', `/api/audit/compliance-report/${agent_id}?${params}`);
      const lines = [
        `Compliance Report — ${r.agent.name}`,
        `Generated: ${r.generatedAt}`,
        `Period: ${r.period.days} days`,
        '', '── Transactions ──',
        `  Total:           ${r.transactionMetrics.total}`,
        `  Completed:       ${r.transactionMetrics.completed}`,
        `  Blocked:         ${r.transactionMetrics.blocked}`,
        `  Pending review:  ${r.transactionMetrics.pendingApproval}`,
        `  Compliance rate: ${r.transactionMetrics.complianceRate}`,
        '', '── Risk controls ──',
        `  Rules configured:    ${r.riskControls.totalRulesConfigured}`,
        `  Rule types:          ${r.riskControls.ruleTypesCovered.join(', ') || 'none'}`,
        `  Kill switches:       ${r.riskControls.killSwitchesConfigured}`,
        `  Kill switches fired: ${r.riskControls.killSwitchesTriggered}`,
      ];
      if (r.recommendations?.length) {
        lines.push('', '── Recommendations ──');
        r.recommendations.forEach(rec => lines.push(`  [${rec.priority}] ${rec.message}`));
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (action_filter) params.set('action', action_filter);
    if (decision_filter) params.set('decision', decision_filter);
    const result = await apiFetch('GET', `/api/audit/agent/${agent_id}?${params}`);
    const logs = result.logs || [];
    if (!logs.length) return { content: [{ type: 'text', text: 'No audit logs found.' }] };
    const formatted = logs.map(l => [
      `[${l.timestamp}] ${l.action}  →  ${l.decision}`,
      l.reasoning ? `  ${JSON.stringify(l.reasoning)}` : null,
    ].filter(Boolean).join('\n')).join('\n');
    return { content: [{ type: 'text', text: `Audit log (${logs.length} entries):\n\n${formatted}` }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: get_wallet_status
// ═══════════════════════════════════════════════════════
server.tool(
  'get_wallet_status',
  'Get the current state of a wallet: balance, active rules, and kill switch status.',
  { wallet_id: z.string().describe('Wallet ID to inspect.') },
  async ({ wallet_id }) => {
    const result = await apiFetch('GET', `/api/wallets/${wallet_id}`);
    const w = result.wallet;
    let ksStatus = null;
    try { ksStatus = await apiFetch('GET', `/api/killswitch/wallet/${wallet_id}`); } catch { /* optional */ }
    const lines = [
      `Wallet ${w.id} — ${w.agentName}`,
      `Status:  ${w.status}`,
      `Balance: $${parseFloat(w.balance).toFixed(2)} ${w.currency}`,
      `Txns:    ${w.transactionCount}`,
      '', `Active rules (${w.activeRules?.length || 0}):`,
      ...(w.activeRules || []).map(r => `  [${r.ruleType}] ${fmt(r.parameters)}`),
    ];
    if (ksStatus?.killSwitches?.length) {
      lines.push('', `Kill switches (${ksStatus.killSwitches.length}):`);
      ksStatus.killSwitches.forEach(ks => {
        lines.push(`  ID: ${ks.id}`);
        lines.push(`  ${ks.triggered ? '⛔ TRIGGERED' : '🟢 Armed'} — ${ks.description}`);
      });
    } else {
      lines.push('', '⚠️  No kill switches configured');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: list_agents
// ═══════════════════════════════════════════════════════
server.tool(
  'list_agents',
  'List all AI agents registered under your AgentWallet owner account.',
  {},
  async () => {
    const result = await apiFetch('GET', '/api/agents');
    const agents = result.agents || [];
    if (!agents.length) return { content: [{ type: 'text', text: 'No agents found. Create one with create_agent.' }] };
    const lines = [`${agents.length} agents:\n`];
    for (const a of agents) {
      lines.push(`  ${a.name}`);
      lines.push(`    Agent ID: ${a.id}`);
      lines.push(`    Status:   ${a.status}`);
      lines.push(`    Wallets:  ${a._count?.wallets || 0}`);
      lines.push('');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: create_agent
// ═══════════════════════════════════════════════════════
server.tool(
  'create_agent',
  `Provision a new AI agent with a governed wallet.
Returns agent ID, wallet ID, and API key — save the key immediately, shown only once.`,
  {
    name: z.string().describe('Agent name e.g. "Trading Bot Alpha"'),
    initial_balance: z.number().min(0).optional().describe('Starting wallet balance in USD.'),
    metadata: z.record(z.unknown()).optional().describe('Optional metadata e.g. { "purpose": "kalshi-trading" }'),
  },
  async ({ name, initial_balance, metadata }) => {
    const agentResult = await apiFetch('POST', '/api/agents', { name, metadata });
    const agent = agentResult.agent;
    const walletResult = await apiFetch('POST', '/api/wallets', { agentId: agent.id });
    const wallet = walletResult.wallet;
    if (initial_balance && initial_balance > 0) {
      await apiFetch('POST', `/api/wallets/${wallet.id}/deposit`, { amount: initial_balance, source: 'initial_funding' });
    }
    return { content: [{ type: 'text', text: [
      `✅ Agent created`,
      `Agent ID:        ${agent.id}`,
      `Agent Name:      ${agent.name}`,
      `API Key:         ${agent.apiKey}`,
      `                 ⚠️  Save this now — not shown again`,
      `Wallet ID:       ${wallet.id}`,
      `Initial balance: $${initial_balance || 0}`,
      '', 'Next steps:',
      '  1. Call set_rule to add spend limits',
      '  2. Call kill_switch(mode="configure") for automatic safety triggers',
      '  3. Call authorize_spend to test governance',
    ].join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: spawn_agent
// ═══════════════════════════════════════════════════════
server.tool(
  'spawn_agent',
  `Spawn a child agent from a parent agent with inherited governance policy.
Children can only be MORE restrictive than their parents — never less.
The governance engine enforces this automatically.
Use this to build multi-agent systems where a parent orchestrator
delegates tasks to child agents with scoped budgets and permissions.`,
  {
    parent_agent_id: z.string().describe('The parent agent ID that is spawning the child.'),
    child_agent_id: z.string().describe('The new child agent ID (must already be created via create_agent).'),
    daily_limit_ratio: z.number().min(0).max(1).optional().describe(
      'Fraction of parent daily limit to give child. 0.5 = child gets 50% of parent budget. Max 1.0.'
    ),
    max_spend_per_tx: z.number().optional().describe('Override max per-transaction amount for child. Cannot exceed parent limit.'),
    daily_limit: z.number().optional().describe('Override daily limit for child. Cannot exceed parent limit.'),
  },
  async ({ parent_agent_id, child_agent_id, daily_limit_ratio, max_spend_per_tx, daily_limit }) => {
    const overrides = {};
    if (daily_limit_ratio !== undefined) overrides.daily_limit_ratio = daily_limit_ratio;
    if (max_spend_per_tx !== undefined) overrides.maxSpendPerTx = max_spend_per_tx;
    if (daily_limit !== undefined) overrides.dailyLimit = daily_limit;

    const result = await apiFetch('POST', '/api/spawn/authorize', {
      parentAgentId: parent_agent_id,
      childAgentId: child_agent_id,
      childPolicyOverrides: overrides,
    });

    if (!result.authorized) {
      return { content: [{ type: 'text', text: `⛔ Spawn rejected: ${result.reason}` }] };
    }

    const policy = result.inheritedPolicy;
    return { content: [{ type: 'text', text: [
      `✅ Spawn authorized`,
      `Child Agent ID: ${result.childAgentId}`,
      `Parent:         ${parent_agent_id}`,
      `Depth:          ${result.lineage.depth}`,
      `Root:           ${result.lineage.root}`,
      `Can spawn:      ${result.lineage.canSpawn}`,
      '',
      'Inherited policy:',
      `  Daily limit:      $${policy.dailyLimit?.toFixed(2) || 'inherited'}`,
      `  Max per tx:       $${policy.maxSpendPerTx?.toFixed(2) || 'inherited'}`,
      '',
      '⚠️  Child policy is locked — it cannot exceed parent limits.',
    ].join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: terminate_agent
// ═══════════════════════════════════════════════════════
server.tool(
  'terminate_agent',
  `Terminate an agent and optionally cascade to all its child agents.
This is a hard stop — the agent and its children are permanently terminated.
Use kill_switch(mode="emergency") if you want a reversible freeze instead.`,
  {
    agent_id: z.string().describe('Agent ID to terminate.'),
    cascade: z.boolean().optional().describe('If true, also terminate all child agents. Default true.'),
  },
  async ({ agent_id, cascade = true }) => {
    const result = await apiFetch('POST', `/api/spawn/terminate/${agent_id}`, { cascade });
    const terminated = result.terminated || [];
    return { content: [{ type: 'text', text: [
      `🔴 Agent terminated`,
      `Terminated: ${terminated.length} agent(s)`,
      ...terminated.map(id => `  • ${id}`),
      cascade ? '\nAll child agents also terminated.' : '\nChildren were NOT terminated (cascade=false).',
    ].join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: get_lineage
// ═══════════════════════════════════════════════════════
server.tool(
  'get_lineage',
  `Get the full agent family tree rooted at the given agent.
Shows parent/child relationships, depth, and status of each agent in the tree.
Use this to understand your multi-agent hierarchy.`,
  {
    agent_id: z.string().describe('Any agent ID in the tree — returns the full tree from root.'),
  },
  async ({ agent_id }) => {
    const result = await apiFetch('GET', `/api/spawn/lineage/${agent_id}`);

    if (!result) {
      return { content: [{ type: 'text', text: 'No lineage found for this agent. It may not have been spawned yet.' }] };
    }

    function renderTree(node, indent = 0) {
      const prefix = '  '.repeat(indent);
      const lines = [`${prefix}${indent === 0 ? '👑' : '└─'} ${node.name || node.agentId}`];
      lines.push(`${prefix}   ID:     ${node.agentId}`);
      lines.push(`${prefix}   Status: ${node.status}`);
      lines.push(`${prefix}   Depth:  ${node.depth}`);
      if (node.children?.length) {
        node.children.forEach(child => lines.push(...renderTree(child, indent + 1)));
      }
      return lines;
    }

    const tree = renderTree(result);
    return { content: [{ type: 'text', text: ['Agent lineage tree:', '', ...tree].join('\n') }] };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL: get_compliance_report
// ═══════════════════════════════════════════════════════
server.tool(
  'get_compliance_report',
  `Generate a SOC2-ready compliance report for an agent.
Includes transaction metrics, risk control coverage, audit trail summary,
and actionable recommendations. Finance and legal teams pay for this.`,
  {
    agent_id: z.string().describe('Agent ID to generate report for.'),
    days: z.number().int().min(1).max(365).optional().describe('Lookback period in days. Default 30.'),
  },
  async ({ agent_id, days = 30 }) => {
    const params = new URLSearchParams({ days });
    const r = await apiFetch('GET', `/api/audit/compliance-report/${agent_id}?${params}`);

    const lines = [
      `╔══════════════════════════════════════════╗`,
      `║  AgentWallet Compliance Report           ║`,
      `╚══════════════════════════════════════════╝`,
      `Agent:     ${r.agent.name} (${r.agent.status})`,
      `Generated: ${r.generatedAt}`,
      `Period:    ${r.period.days} days`,
      '',
      '── Transaction metrics ──────────────────────',
      `  Total:            ${r.transactionMetrics.total}`,
      `  Completed:        ${r.transactionMetrics.completed}`,
      `  Blocked:          ${r.transactionMetrics.blocked}`,
      `  Pending approval: ${r.transactionMetrics.pendingApproval}`,
      `  Kill sw blocked:  ${r.transactionMetrics.killSwitchBlocked}`,
      `  Compliance rate:  ${r.transactionMetrics.complianceRate}`,
      '',
      '── Risk controls ────────────────────────────',
      `  Rules configured:      ${r.riskControls.totalRulesConfigured}`,
      `  Rule types covered:    ${r.riskControls.ruleTypesCovered.join(', ') || 'none'}`,
      `  Kill switches:         ${r.riskControls.killSwitchesConfigured}`,
      `  Kill switches fired:   ${r.riskControls.killSwitchesTriggered}`,
      '',
      '── Audit trail ──────────────────────────────',
      `  Total events: ${r.auditTrail.totalEvents}`,
      ...Object.entries(r.auditTrail.eventsByType).map(([k,v]) => `  ${k}: ${v}`),
    ];

    if (r.recommendations?.length) {
      lines.push('', '── Recommendations ──────────────────────────');
      r.recommendations.forEach(rec => {
        const icon = rec.priority === 'HIGH' ? '🔴' : '🟡';
        lines.push(`  ${icon} [${rec.priority}] ${rec.message}`);
      });
    } else {
      lines.push('', '✅ No recommendations — governance posture is healthy.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ─────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
