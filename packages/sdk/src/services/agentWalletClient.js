/**
 * AgentWallet Client for Node.js
 * Calls the Python AgentWallet API server
 */

const BASE_URL = process.env.AGENT_WALLET_API_URL || 'http://localhost:8100';

class AgentWalletClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.detail || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // Health & Status
  // ─────────────────────────────────────────────────────────────

  async health() {
    return this.request('GET', '/health');
  }

  async status() {
    return this.request('GET', '/status');
  }

  // ─────────────────────────────────────────────────────────────
  // Agents
  // ─────────────────────────────────────────────────────────────

  async createAgent({ name, description = '', spendLimit = null, metadata = {} }) {
    return this.request('POST', '/agents', {
      name,
      description,
      spend_limit: spendLimit ? {
        max_per_order: spendLimit.maxPerOrder,
        max_per_day: spendLimit.maxPerDay,
        max_per_week: spendLimit.maxPerWeek,
        max_position_size: spendLimit.maxPositionSize,
        allowed_tickers: spendLimit.allowedTickers,
        blocked_tickers: spendLimit.blockedTickers || [],
      } : null,
      metadata,
    });
  }

  async listAgents() {
    return this.request('GET', '/agents');
  }

  async getAgent(agentId) {
    return this.request('GET', `/agents/${agentId}`);
  }

  async deactivateAgent(agentId) {
    return this.request('POST', `/agents/${agentId}/deactivate`);
  }

  async activateAgent(agentId) {
    return this.request('POST', `/agents/${agentId}/activate`);
  }

  // ─────────────────────────────────────────────────────────────
  // Wallet Operations
  // ─────────────────────────────────────────────────────────────

  async getBalance(agentId) {
    return this.request('GET', `/agents/${agentId}/balance`);
  }

  async getPositions(agentId, limit = 100) {
    return this.request('GET', `/agents/${agentId}/positions?limit=${limit}`);
  }

  async getMarkets(agentId, { status = null, limit = 100 } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (status) params.append('status', status);
    return this.request('GET', `/agents/${agentId}/markets?${params}`);
  }

  async getOrderbook(agentId, ticker, depth = 10) {
    return this.request('GET', `/agents/${agentId}/orderbook/${ticker}?depth=${depth}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Trading
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an order through spend controls
   * @returns {Promise<{status: 'executed'|'pending_approval', order?: object, request_id?: string}>}
   */
  async createOrder(agentId, { ticker, side, action, count, type = 'limit', yesPrice = null, noPrice = null }) {
    return this.request('POST', `/agents/${agentId}/orders`, {
      ticker,
      side,
      action,
      count,
      type,
      yes_price: yesPrice,
      no_price: noPrice,
    });
  }

  async cancelOrder(agentId, orderId) {
    return this.request('DELETE', `/agents/${agentId}/orders/${orderId}`);
  }

  async cancelAllOrders(agentId, ticker = null) {
    const params = ticker ? `?ticker=${ticker}` : '';
    return this.request('DELETE', `/agents/${agentId}/orders${params}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Approvals
  // ─────────────────────────────────────────────────────────────

  async listPendingApprovals() {
    return this.request('GET', '/approvals/pending');
  }

  async getApproval(requestId) {
    return this.request('GET', `/approvals/${requestId}`);
  }

  async approveRequest(requestId, approver = '') {
    return this.request('POST', `/approvals/${requestId}`, {
      request_id: requestId,
      approved: true,
      approver,
    });
  }

  async denyRequest(requestId, approver = '') {
    return this.request('POST', `/approvals/${requestId}`, {
      request_id: requestId,
      approved: false,
      approver,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Kill Switch
  // ─────────────────────────────────────────────────────────────

  async activateKillSwitch(agentId, reason = '') {
    return this.request('POST', `/agents/${agentId}/kill-switch`, { reason });
  }

  async deactivateKillSwitch(agentId) {
    return this.request('DELETE', `/agents/${agentId}/kill-switch`);
  }

  async globalKillSwitch(reason = '') {
    return this.request('POST', '/kill-switch', { reason });
  }

  // ─────────────────────────────────────────────────────────────
  // Rules
  // ─────────────────────────────────────────────────────────────

  /**
   * Add a rule to the engine
   * @param {object} rule
   * @param {string} rule.ruleId - Unique rule identifier
   * @param {string} rule.name - Human-readable name
   * @param {string} rule.description - Description
   * @param {string} rule.conditionType - One of: max_order_value, ticker_block, time_block, weekend_block, position_size, daily_spend
   * @param {object} rule.conditionParams - Parameters for the condition
   * @param {string} rule.action - One of: allow, deny, require_approval
   * @param {number} rule.priority - Higher = evaluated first
   */
  async createRule({ ruleId, name, description, conditionType, conditionParams, action, priority = 0 }) {
    return this.request('POST', '/rules', {
      rule_id: ruleId,
      name,
      description,
      condition_type: conditionType,
      condition_params: conditionParams,
      action,
      priority,
    });
  }

  async listRules() {
    return this.request('GET', '/rules');
  }

  async deleteRule(ruleId) {
    return this.request('DELETE', `/rules/${ruleId}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Audit Log
  // ─────────────────────────────────────────────────────────────

  async getAuditLog({ agentId = null, limit = 100 } = {}) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (agentId) params.append('agent_id', agentId);
    return this.request('GET', `/audit?${params}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Express Router (optional - for integrating into existing backend)
// ─────────────────────────────────────────────────────────────────

function createAgentWalletRouter(client) {
  const express = require('express');
  const router = express.Router();

  // Proxy all requests to the Python API
  router.use(async (req, res, next) => {
    try {
      const result = await client.request(
        req.method,
        req.path + (req.query ? '?' + new URLSearchParams(req.query).toString() : ''),
        req.body && Object.keys(req.body).length > 0 ? req.body : null
      );
      res.json(result);
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        details: error.data,
      });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────

module.exports = {
  AgentWalletClient,
  createAgentWalletRouter,
};

// ─────────────────────────────────────────────────────────────────
// Example usage (run with: node agentWalletClient.js)
// ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const client = new AgentWalletClient();

    console.log('Testing AgentWallet API...\n');

    try {
      // Health check
      const health = await client.health();
      console.log('Health:', health);

      // Status
      const status = await client.status();
      console.log('Status:', status);

      // Create an agent
      const agent = await client.createAgent({
        name: 'test-bot-js',
        description: 'Test bot from Node.js',
        spendLimit: {
          maxPerOrder: 2500,     // $25
          maxPerDay: 10000,      // $100
          maxPerWeek: 25000,     // $250
          maxPositionSize: 50,
        },
      });
      console.log('\nCreated agent:', agent);

      // Get balance
      const balance = await client.getBalance(agent.agent_id);
      console.log('Balance:', balance);

      // List markets
      const markets = await client.getMarkets(agent.agent_id, { status: 'open', limit: 5 });
      console.log('\nOpen markets:', markets.markets?.length || 0);

      // View audit log
      const audit = await client.getAuditLog({ limit: 5 });
      console.log('\nRecent audit events:', audit.events?.length || 0);

      console.log('\n✅ All tests passed!');

    } catch (error) {
      console.error('Error:', error.message);
      if (error.status === undefined) {
        console.error('Is the AgentWallet API running? Start it with:');
        console.error('  cd packages/sdk/src/services && uvicorn agent_wallet_api:app --port 8100');
      }
    }
  })();
}
