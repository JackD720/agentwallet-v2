/**
 * AgentWallet MCP Server
 *
 * Exposes AgentWallet governance infrastructure as MCP tools so any
 * AI agent framework (Claude, Cursor, Cline, LangChain w/ MCP, etc.)
 * can plug in spend controls, kill switches, and audit trails with
 * zero backend wiring.
 *
 * Tools exposed:
 *   authorize_spend        — run a transaction through the rules engine
 *   set_rule               — add a governance rule to a wallet
 *   kill_switch            — emergency stop OR configure automatic triggers
 *   get_audit_log          — query the immutable audit trail
 *   get_wallet_status      — balance + active rules + kill switch state
 *   list_agents            — list agents under your owner key
 *   create_agent           — provision a new governed agent
 *   get_compliance_report  — SOC2-style compliance summary
 *
 * Usage (stdio transport — works with Claude Desktop, Cursor, Cline):
 *   AGENTWALLET_API_URL=https://your-api.run.app \
 *   AGENTWALLET_API_KEY=your-owner-api-key \
 *   node src/server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

const API_URL = process.env.AGENTWALLET_API_URL || 'http://localhost:3000';
const API_KEY  = process.env.AGENTWALLET_API_KEY;

if (!API_KEY) {
  console.error('[AgentWallet MCP] ERROR: AGENTWALLET_API_KEY env var is required');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────

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
    throw new Error(
      `AgentWallet API ${method} ${path} → ${res.status}: ${json.error || text}`
    );
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────
// Format helpers — human-readable tool output
// ─────────────────────────────────────────────────────────────────

function fmt(obj) {
  return JSON.stringify(obj, null, 2);
}

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
    if (ruleEval.killSwitched) {
      lines.push('\n⛔ KILL SWITCH ACTIVE — all transactions blocked');
    }
    if (ruleEval.results?.length) {
      const failed = ruleEval.results.filter(r => !r.passed);
      if (failed.length) {
        lines.push('\nFailed rules:');
        failed.forEach(r => lines.push(`  • [${r.ruleType}] ${r.reason}`));
      }
      if (ruleEval.requiresApproval) {
        lines.push('\n⚠️  Requires human approval — use approve endpoint');
      }
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'agentwallet',
  version: '1.0.0',
});


// ═══════════════════════════════════════════════════════════════
// TOOL: authorize_spend
// ═══════════════════════════════════════════════════════════════

server.tool(
  'authorize_spend',
  `Run a financial transaction through AgentWallet's governance engine.
Every spend request is evaluated against the wallet's active rules (spend limits,
category restrictions, time windows, kill switches) before any money moves.
Returns approved/rejected status, which rules fired, and the transaction record.`,
  {
    wallet_id: z.string().describe(
      'The wallet ID to spend from. Get this from get_wallet_status or list_agents.'
    ),
    amount: z.number().positive().describe(
      'Transaction amount in USD (e.g. 49.99). Must be positive.'
    ),
    category: z.string().optional().describe(
      'Spend category — used for category whitelist/blacklist rules. ' +
      'Examples: "llm-inference", "api-call", "trading", "advertising", "hosting", "software"'
    ),
    description: z.string().optional().describe(
      'Human-readable description of what this payment is for.'
    ),
    recipient_id: z.string().optional().describe(
      'Recipient identifier — used for recipient whitelist/blacklist rules. ' +
      'Can be a vendor ID, service name, or wallet address.'
    ),
    metadata: z.record(z.unknown()).optional().describe(
      'Optional key-value metadata attached to the transaction. ' +
      'Useful for signal_filter rules: e.g. { "signal_strength": "STRONG", "model": "gpt-4" }'
    ),
  },
  async ({ wallet_id, amount, category, description, recipient_id, metadata }) => {
    const payload = {
      walletId: wallet_id,
      amount,
      ...(category     && { category }),
      ...(description  && { description }),
      ...(recipient_id && { recipientId: recipient_id }),
      ...(metadata     && { metadata }),
    };

    let result;
    let isError = false;

    try {
      result = await apiFetch('POST', '/api/transactions', payload);
    } catch (err) {
      // Parse rejection body from error message if possible
      const msg = err.message || '';
      const jsonStart = msg.indexOf('{');
      if (jsonStart !== -1) {
        try {
          result = JSON.parse(msg.slice(msg.indexOf(':')+1).trim());
        } catch { /* fall through */ }
      }
      if (!result) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
      isError = true;
    }

    const tx = result.transaction;
    const eval_ = result.ruleEvaluation;

    const summary = tx
      ? txSummary(tx, eval_)
      : result.message || fmt(result);

    const blocks = [
      { type: 'text', text: summary },
    ];

    if (eval_?.results?.length) {
      blocks.push({
        type: 'text',
        text: '\nFull rule evaluation:\n' + fmt(eval_.results),
      });
    }

    return { content: blocks, isError };
  }
);


// ═══════════════════════════════════════════════════════════════
// TOOL: set_rule
// ═══════════════════════════════════════════════════════════════

server.tool(
  'set_rule',
  `Add a governance rule to a wallet. Rules are evaluated in priority order
on every transaction before money moves.

Available rule types:
  PER_TRANSACTION_LIMIT  — block single txs above $N         → parameters: { limit: 100 }
  DAILY_LIMIT            — block if daily spend > $N          → parameters: { limit: 500 }
  WEEKLY_LIMIT           — block if weekly spend > $N         → parameters: { limit: 2000 }
  MONTHLY_LIMIT          — block if monthly spend > $N        → parameters: { limit: 5000 }
  CATEGORY_WHITELIST     — only allow listed categories        → parameters: { categories: ["hosting","software"] }
  CATEGORY_BLACKLIST     — block listed categories             → parameters: { categories: ["gambling"] }
  RECIPIENT_WHITELIST    — only pay whitelisted recipients     → parameters: { recipients: ["stripe","openai"] }
  RECIPIENT_BLACKLIST    — block specific recipients           → parameters: { recipients: ["bad-vendor"] }
  TIME_WINDOW            — only transact during these UTC hrs  → parameters: { startHour: 9, endHour: 17 }
  REQUIRES_APPROVAL      — flag txs above $N for human review  → parameters: { threshold: 500 }`,
  {
    wallet_id: z.string().describe('Wallet to apply this rule to.'),
    rule_type: z.enum([
      'PER_TRANSACTION_LIMIT',
      'DAILY_LIMIT',
      'WEEKLY_LIMIT',
      'MONTHLY_LIMIT',
      'CATEGORY_WHITELIST',
      'CATEGORY_BLACKLIST',
      'RECIPIENT_WHITELIST',
      'RECIPIENT_BLACKLIST',
      'TIME_WINDOW',
      'REQUIRES_APPROVAL',
    ]).describe('The governance rule type to add.'),
    parameters: z.record(z.unknown()).describe(
      'Rule parameters. Shape depends on rule_type — see tool description above.'
    ),
    priority: z.number().int().min(0).max(1000).optional().describe(
      'Rule evaluation priority (higher = evaluated first). Default 0. ' +
      'Use priority 900+ for critical safety rules.'
    ),
  },
  async ({ wallet_id, rule_type, parameters, priority }) => {
    const result = await apiFetch('POST', '/api/rules', {
      walletId:  wallet_id,
      ruleType:  rule_type,
      parameters,
      ...(priority !== undefined && { priority }),
    });

    const rule = result.rule;
    const lines = [
      `✅ Rule created`,
      `Rule ID:    ${rule.id}`,
      `Type:       ${rule.ruleType}`,
      `Parameters: ${fmt(rule.parameters)}`,
      `Priority:   ${rule.priority}`,
      `Active:     ${rule.active}`,
      `Wallet:     ${rule.walletId}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);


// ═══════════════════════════════════════════════════════════════
// TOOL: kill_switch
// ═══════════════════════════════════════════════════════════════

server.tool(
  'kill_switch',
  `Control the AgentWallet kill switch — your circuit breaker for when things go wrong.

Three modes:
  "emergency"   — immediately freeze a wallet and halt the agent. Use this NOW.
  "configure"   — set an automatic kill switch trigger (e.g. stop if 20% drawdown)
  "reset"       — re-enable a wallet after reviewing why it was stopped

Automatic trigger types (for mode="configure"):
  DRAWDOWN_PERCENT    — threshold: 0.20 = stop at 20% drawdown from peak
  LOSS_AMOUNT         — threshold: 100  = stop if total losses > $100
  CONSECUTIVE_LOSSES  — threshold: 5    = stop after 5 losses in a row
  DAILY_LOSS_LIMIT    — threshold: 50   = stop if daily losses > $50`,
  {
    mode: z.enum(['emergency', 'configure', 'reset']).describe(
      '"emergency" = immediately freeze wallet. ' +
      '"configure" = set automatic trigger. ' +
      '"reset" = re-enable after review.'
    ),
    wallet_id: z.string().describe('Target wallet ID.'),
    // emergency mode
    reason: z.string().optional().describe(
      '[emergency mode] Why you are stopping this agent.'
    ),
    // configure mode
    trigger_type: z.enum([
      'DRAWDOWN_PERCENT',
      'LOSS_AMOUNT',
      'CONSECUTIVE_LOSSES',
      'DAILY_LOSS_LIMIT',
    ]).optional().describe('[configure mode] What condition triggers the kill switch.'),
    threshold: z.number().optional().describe(
      '[configure mode] Numeric threshold. ' +
      'DRAWDOWN_PERCENT: 0–1 (e.g. 0.20 = 20%). ' +
      'LOSS_AMOUNT / DAILY_LOSS_LIMIT: dollar amount. ' +
      'CONSECUTIVE_LOSSES: integer count.'
    ),
    window_hours: z.number().int().optional().describe(
      '[configure mode] Lookback window in hours for the trigger condition. Default 24.'
    ),
    // reset mode
    kill_switch_id: z.string().optional().describe(
      '[reset mode] The kill switch ID to reset. Get this from get_wallet_status.'
    ),
  },
  async ({ mode, wallet_id, reason, trigger_type, threshold, window_hours, kill_switch_id }) => {
    if (mode === 'emergency') {
      const result = await apiFetch(
        'POST',
        `/api/killswitch/emergency/${wallet_id}`,
        { reason }
      );
      return {
        content: [{
          type: 'text',
          text: [
            `⛔ EMERGENCY STOP ACTIVATED`,
            `Wallet: ${result.walletId}  →  ${result.walletStatus}`,
            `Agent:  ${result.agentStatus}`,
            `Reason: ${result.reason}`,
            '',
            'All transactions are now blocked. Use mode="reset" with the kill_switch_id',
            'from get_wallet_status to re-enable after reviewing.',
          ].join('\n'),
        }],
      };
    }

    if (mode === 'configure') {
      if (!trigger_type || threshold === undefined) {
        throw new Error('configure mode requires trigger_type and threshold');
      }
      const result = await apiFetch('POST', '/api/killswitch', {
        walletId:    wallet_id,
        triggerType: trigger_type,
        threshold,
        ...(window_hours !== undefined && { windowHours: window_hours }),
      });
      const ks = result.killSwitch;
      return {
        content: [{
          type: 'text',
          text: [
            `✅ Kill switch configured`,
            `Kill Switch ID: ${ks.id}`,
            `Trigger:        ${ks.triggerType}`,
            `Threshold:      ${ks.threshold}`,
            `Window:         ${ks.windowHours}h`,
            `Status:         ${ks.triggered ? '⛔ TRIGGERED' : '🟢 Armed (not triggered)'}`,
            '',
            `Description: ${result.description}`,
          ].join('\n'),
        }],
      };
    }

    if (mode === 'reset') {
      if (!kill_switch_id) {
        throw new Error('reset mode requires kill_switch_id — get this from get_wallet_status');
      }
      const result = await apiFetch('POST', `/api/killswitch/${kill_switch_id}/reset`, {});
      return {
        content: [{
          type: 'text',
          text: [
            `✅ Kill switch reset`,
            `Kill Switch ID: ${kill_switch_id}`,
            `Wallet status:  ${result.walletStatus}`,
            '',
            'Wallet is active again. Transactions are unblocked.',
          ].join('\n'),
        }],
      };
    }

    throw new Error(`Unknown mode: ${mode}`);
  }
);


// ═══════════════════════════════════════════════════════════════
// TOOL: get_audit_log
// ═══════════════════════════════════════════════════════════════

server.tool(
  'get_audit_log',
  `Query the immutable audit trail for an agent. Every transaction attempt,
rule evaluation, kill switch trigger, and governance decision is logged here.
Use this for compliance reviews, debugging unexpected blocks, or generating
SOC2-ready audit exports.`,
  {
    agent_id: z.string().describe('Agent ID to fetch audit logs for.'),
    mode: z.enum(['logs', 'summary', 'compliance_report']).optional().describe(
      '"logs" = raw event stream (default). ' +
      '"summary" = aggregate counts by action/decision. ' +
      '"compliance_report" = full SOC2-ready report with recommendations.'
    ),
    limit: z.number().int().min(1).max(1000).optional().describe(
      '[logs mode] Number of log entries to return. Default 50.'
    ),
    from: z.string().optional().describe(
      '[logs mode] ISO timestamp — only return logs after this date. e.g. "2025-01-01T00:00:00Z"'
    ),
    to: z.string().optional().describe(
      '[logs mode] ISO timestamp — only return logs before this date.'
    ),
    action_filter: z.enum([
      'TRANSACTION_REQUESTED',
      'TRANSACTION_APPROVED',
      'TRANSACTION_REJECTED',
      'TRANSACTION_EXECUTED',
      'KILL_SWITCH_TRIGGERED',
      'KILL_SWITCH_RESET',
      'RULE_CREATED',
      'RULE_UPDATED',
      'RULE_DELETED',
    ]).optional().describe('[logs mode] Filter to a specific action type.'),
    decision_filter: z.enum(['ALLOWED', 'BLOCKED', 'ESCALATED', 'SYSTEM']).optional().describe(
      '[logs mode] Filter to a specific governance decision.'
    ),
    days: z.number().int().min(1).max(365).optional().describe(
      '[summary/compliance_report mode] Lookback period in days. Default 7 for summary, 30 for compliance.'
    ),
  },
  async ({ agent_id, mode = 'logs', limit, from, to, action_filter, decision_filter, days }) => {
    if (mode === 'summary') {
      const params = new URLSearchParams({ days: days || 7 });
      const result = await apiFetch('GET', `/api/audit/summary/${agent_id}?${params}`);
      return {
        content: [{
          type: 'text',
          text: [
            `Audit summary — ${result.agentName} (${result.period.days}d)`,
            '',
            `Total actions:    ${result.summary.totalActions}`,
            `Blocked:          ${result.summary.blockedActions} (${result.summary.blockRate})`,
            `Escalated:        ${result.summary.escalatedActions}`,
            `Kill sw triggers: ${result.summary.killSwitchTriggers}`,
            '',
            'By action:',
            ...Object.entries(result.byAction).map(([k, v]) => `  ${k}: ${v}`),
            '',
            'By decision:',
            ...Object.entries(result.byDecision).map(([k, v]) => `  ${k}: ${v}`),
            '',
            'Daily breakdown:',
            ...result.byDay.map(d =>
              `  ${d.date}  total=${d.total}  blocked=${d.blocked || 0}  allowed=${d.allowed || 0}`
            ),
          ].join('\n'),
        }],
      };
    }

    if (mode === 'compliance_report') {
      const params = new URLSearchParams({ days: days || 30 });
      const r = await apiFetch('GET', `/api/audit/compliance-report/${agent_id}?${params}`);
      const lines = [
        `Compliance Report — ${r.agent.name}`,
        `Generated: ${r.generatedAt}`,
        `Period:    ${r.period.days} days`,
        '',
        '── Transactions ──',
        `  Total:          ${r.transactionMetrics.total}`,
        `  Completed:      ${r.transactionMetrics.completed}`,
        `  Blocked:        ${r.transactionMetrics.blocked}`,
        `  Pending review: ${r.transactionMetrics.pendingApproval}`,
        `  Compliance rate:${r.transactionMetrics.complianceRate}`,
        '',
        '── Risk controls ──',
        `  Rules configured:      ${r.riskControls.totalRulesConfigured}`,
        `  Rule types covered:    ${r.riskControls.ruleTypesCovered.join(', ') || 'none'}`,
        `  Kill switches:         ${r.riskControls.killSwitchesConfigured}`,
        `  Kill switches fired:   ${r.riskControls.killSwitchesTriggered}`,
        '',
        '── Audit trail ──',
        `  Total events: ${r.auditTrail.totalEvents}`,
        ...Object.entries(r.auditTrail.eventsByType).map(([k, v]) => `  ${k}: ${v}`),
      ];
      if (r.recommendations?.length) {
        lines.push('', '── Recommendations ──');
        r.recommendations.forEach(rec => {
          lines.push(`  [${rec.priority}] ${rec.message}`);
        });
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // Default: raw logs
    const params = new URLSearchParams();
    if (limit)         params.set('limit', limit);
    if (from)          params.set('from', from);
    if (to)            params.set('to', to);
    if (action_filter) params.set('action', action_filter);
    if (decision_filter) params.set('decision', decision_filter);

    const result = await apiFetch('GET', `/api/audit/agent/${agent_id}?${params}`);
    const logs = result.logs || [];

    if (!logs.length) {
      return { content: [{ type: 'text', text: 'No audit logs found for the given filters.' }] };
    }

    const formatted = logs.map(l => [
      `[${l.timestamp}] ${l.action}  →  ${l.decision}`,
      l.reasoning ? `  ${JSON.stringify(l.reasoning)}` : null,
    ].filter(Boolean).join('\n')).join('\n');

    const header = `Audit log — agent ${agent_id} (${logs.length} entries${result.hasMore ? ', more available' : ''}):\n\n`;

    return { content: [{ type: 'text', text: header + formatted }] };
  }
);


// ═══════════════════════════════════════════════════════════════
// TOOL: get_wallet_status
// ═══════════════════════════════════════════════════════════════

server.tool(
  'get_wallet_status',
  `Get the current state of a wallet: balance, active rules, and kill switch status.
Use this before calling authorize_spend to understand the current governance posture,
or to get the wallet_id and kill_switch_id values needed by other tools.`,
  {
    wallet_id: z.string().describe('Wallet ID to inspect.'),
  },
  async ({ wallet_id }) => {
    const result = await apiFetch('GET', `/api/wallets/${wallet_id}`);
    const w = result.wallet;

    // Also grab kill switch status
    let ksStatus = null;
    try {
      ksStatus = await apiFetch('GET', `/api/killswitch/wallet/${wallet_id}`);
    } catch { /* optional */ }

    const lines = [
      `Wallet ${w.id} — ${w.agentName}`,
      `Status:    ${w.status}`,
      `Balance:   $${parseFloat(w.balance).toFixed(2)} ${w.currency}`,
      `Txns:      ${w.transactionCount}`,
      '',
      `Active rules (${w.activeRules?.length || 0}):`,
    ];

    (w.activeRules || []).forEach(r => {
      lines.push(`  [${r.ruleType}] ${fmt(r.parameters)}`);
    });

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


// ═══════════════════════════════════════════════════════════════
// TOOL: list_agents
// ═══════════════════════════════════════════════════════════════

server.tool(
  'list_agents',
  `List all AI agents registered under your AgentWallet owner account.
Returns agent IDs, names, status, and wallet counts. Use this to get the
agent_id and wallet_id values needed by the other tools.`,
  {},
  async () => {
    const result = await apiFetch('GET', '/api/agents');
    const agents = result.agents || [];

    if (!agents.length) {
      return {
        content: [{
          type: 'text',
          text: 'No agents found. Create one with create_agent.',
        }],
      };
    }

    const lines = [`${agents.length} agents:\n`];
    for (const a of agents) {
      lines.push(`  ${a.name}`);
      lines.push(`    Agent ID: ${a.id}`);
      lines.push(`    Status:   ${a.status}`);
      lines.push(`    Wallets:  ${a._count?.wallets || 0}`);
      lines.push(`    Created:  ${a.createdAt}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);


// ═══════════════════════════════════════════════════════════════
// TOOL: create_agent
// ═══════════════════════════════════════════════════════════════

server.tool(
  'create_agent',
  `Provision a new AI agent with a governed wallet. Returns the agent ID,
wallet ID, and API key. The API key is only shown once — save it immediately.
After creation you'll want to call set_rule to configure spend controls
and kill_switch (mode="configure") to add automatic safety triggers.`,
  {
    name: z.string().describe('Human-readable name for this agent. e.g. "Trading Bot Alpha"'),
    initial_balance: z.number().min(0).optional().describe(
      'Starting wallet balance in USD. Default 0 (fund separately via deposit endpoint).'
    ),
    metadata: z.record(z.unknown()).optional().describe(
      'Optional metadata attached to the agent. e.g. { "purpose": "kalshi-trading", "version": "2" }'
    ),
  },
  async ({ name, initial_balance, metadata }) => {
    // Create agent
    const agentResult = await apiFetch('POST', '/api/agents', { name, metadata });
    const agent = agentResult.agent;

    // Create wallet
    const walletResult = await apiFetch('POST', '/api/wallets', { agentId: agent.id });
    const wallet = walletResult.wallet;

    // Fund wallet if requested
    if (initial_balance && initial_balance > 0) {
      await apiFetch('POST', `/api/wallets/${wallet.id}/deposit`, {
        amount: initial_balance,
        source: 'initial_funding',
      });
    }

    return {
      content: [{
        type: 'text',
        text: [
          `✅ Agent created`,
          '',
          `Agent ID:  ${agent.id}`,
          `Agent Name: ${agent.name}`,
          `API Key:   ${agent.apiKey}`,
          `           ⚠️  Save this now — not shown again`,
          '',
          `Wallet ID:      ${wallet.id}`,
          `Initial balance: $${initial_balance || 0}`,
          '',
          'Next steps:',
          '  1. Call set_rule to add spend limits and category controls',
          '  2. Call kill_switch(mode="configure") to add automatic safety triggers',
          '  3. Call authorize_spend to test the governance flow',
        ].join('\n'),
      }],
    };
  }
);


// ─────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
