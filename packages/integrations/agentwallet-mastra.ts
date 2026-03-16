/**
 * AgentWallet x Mastra Integration
 *
 * Governance tools for Mastra AI agents.
 * Wire spend controls, kill switches, and audit trails
 * into any Mastra agent in 3 lines.
 *
 * Usage:
 *   import { createAgentWalletTools } from './agentwallet-mastra';
 *
 *   const tools = createAgentWalletTools({
 *     apiUrl: 'https://your-api.run.app',
 *     apiKey: 'your-owner-key',
 *     walletId: 'your-wallet-id',
 *   });
 *
 *   const agent = new Agent({
 *     name: 'Financial Agent',
 *     tools,
 *   });
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface AgentWalletConfig {
  apiUrl: string;
  apiKey: string;
  walletId: string;
}

async function apiFetch(
  config: AgentWalletConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = (json as Record<string, string>)?.error || text;
    throw new Error(`AgentWallet ${method} ${path} → ${res.status}: ${err}`);
  }
  return json;
}

// ─────────────────────────────────────────────────────────
// authorize_spend
// ─────────────────────────────────────────────────────────

function createAuthorizeSpendTool(config: AgentWalletConfig) {
  return createTool({
    id: 'authorize_spend',
    description:
      'Authorize a financial transaction through AgentWallet governance. ' +
      'ALWAYS call this before spending money. ' +
      'The rules engine evaluates spend limits, category restrictions, and kill switches. ' +
      'Returns APPROVED, REJECTED, or AWAITING HUMAN APPROVAL.',
    inputSchema: z.object({
      amount: z.number().positive().describe('Amount in USD to spend'),
      category: z.string().optional().describe("Spend category e.g. 'api-call', 'trading'"),
      description: z.string().optional().describe('What this payment is for'),
      recipient_id: z.string().optional().describe('Recipient identifier for whitelist rules'),
    }),
    execute: async ({ context }) => {
      const { amount, category, description, recipient_id } = context;
      const payload: Record<string, unknown> = { walletId: config.walletId, amount };
      if (category) payload.category = category;
      if (description) payload.description = description;
      if (recipient_id) payload.recipientId = recipient_id;

      try {
        const result = await apiFetch(config, 'POST', '/api/transactions', payload) as Record<string, unknown>;
        const tx = result.transaction as Record<string, unknown> | undefined;
        const eval_ = result.ruleEvaluation as Record<string, unknown> | undefined;
        const status = tx?.status as string || 'UNKNOWN';

        if (status === 'COMPLETED') {
          return { approved: true, message: `✅ APPROVED — $${amount} authorized. Tx ID: ${tx?.id}` };
        } else if (status === 'REJECTED') {
          if (eval_?.killSwitched) {
            return { approved: false, message: '⛔ KILL SWITCH ACTIVE — all transactions blocked.' };
          }
          const results = (eval_?.results as Array<{ passed: boolean; reason: string }>) || [];
          const failed = results.filter(r => !r.passed).map(r => r.reason);
          return { approved: false, message: `⛔ REJECTED — ${failed.join('; ')}` };
        } else if (status === 'AWAITING_APPROVAL') {
          return { approved: false, pending: true, message: `⚠️ AWAITING HUMAN APPROVAL — Tx ID: ${tx?.id}` };
        }
        return { approved: false, message: `Status: ${status}` };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { approved: false, message: `⛔ GOVERNANCE BLOCK — ${message}` };
      }
    },
  });
}

// ─────────────────────────────────────────────────────────
// check_wallet
// ─────────────────────────────────────────────────────────

function createCheckWalletTool(config: AgentWalletConfig) {
  return createTool({
    id: 'check_wallet',
    description:
      'Check the wallet balance, active governance rules, and kill switch status. ' +
      'Use this before planning any spending to understand available budget and restrictions.',
    inputSchema: z.object({}),
    execute: async () => {
      const result = await apiFetch(config, 'GET', `/api/wallets/${config.walletId}`) as Record<string, unknown>;
      const w = result.wallet as Record<string, unknown>;
      const rules = (w.activeRules as Array<Record<string, unknown>>) || [];
      return {
        balance: parseFloat(w.balance as string),
        currency: w.currency,
        status: w.status,
        rules: rules.map(r => ({ type: r.ruleType, params: r.parameters })),
      };
    },
  });
}

// ─────────────────────────────────────────────────────────
// emergency_stop
// ─────────────────────────────────────────────────────────

function createEmergencyStopTool(config: AgentWalletConfig) {
  return createTool({
    id: 'emergency_stop',
    description:
      'Immediately freeze the wallet and halt all agent spending. ' +
      'Use this if you detect anomalous behavior, unexpected charges, or any safety concern. ' +
      'A human can reset this.',
    inputSchema: z.object({
      reason: z.string().describe('Why you are triggering an emergency stop'),
    }),
    execute: async ({ context }) => {
      await apiFetch(config, 'POST', `/api/killswitch/emergency/${config.walletId}`, {
        reason: context.reason,
      });
      return { stopped: true, message: `⛔ EMERGENCY STOP ACTIVATED — Reason: ${context.reason}` };
    },
  });
}

// ─────────────────────────────────────────────────────────
// createAgentWalletTools — main export
// ─────────────────────────────────────────────────────────

/**
 * Create AgentWallet governance tools for a Mastra agent.
 *
 * @example
 * const tools = createAgentWalletTools({
 *   apiUrl: process.env.AGENTWALLET_API_URL,
 *   apiKey: process.env.AGENTWALLET_API_KEY,
 *   walletId: process.env.AGENTWALLET_WALLET_ID,
 * });
 *
 * const agent = new Agent({ name: 'Finance Agent', tools });
 */
export function createAgentWalletTools(config: AgentWalletConfig) {
  return {
    authorize_spend: createAuthorizeSpendTool(config),
    check_wallet: createCheckWalletTool(config),
    emergency_stop: createEmergencyStopTool(config),
  };
}
