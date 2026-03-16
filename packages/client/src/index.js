/**
 * @agentwallet/sdk
 * Governance infrastructure for AI agents
 * 
 * Free to self-host. Managed service at https://agentwallet.ai
 */

const DEFAULT_BASE_URL = 'https://agentwallet-sdk-164814074525.us-central1.run.app';

class AgentWallet {
  /**
   * @param {object} options
   * @param {string} options.apiKey - Your AgentWallet API key
   * @param {string} [options.baseUrl] - Custom backend URL (for self-hosted deployments)
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL } = {}) {
    if (!apiKey) throw new Error('[AgentWallet] apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async _request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  // ─── Health ────────────────────────────────────────────────────

  async health() {
    return this._request('GET', '/health');
  }

  // ─── Agents ───────────────────────────────────────────────────

  /**
   * Spawn a new agent with governance controls
   * @param {object} options
   * @param {string} options.name - Agent name
   * @param {object} [options.spendLimits] - Spending guardrails
   * @param {number} [options.spendLimits.perTransaction] - Max per transaction (dollars)
   * @param {number} [options.spendLimits.perDay] - Max per day (dollars)
   * @param {object} [options.deadManSwitch] - Dead man's switch config
   * @param {number} [options.deadManSwitch.timeoutMs] - ms before agent is terminated if no heartbeat
   * @param {object} [options.metadata] - Arbitrary metadata
   */
  async spawnAgent({ name, spendLimits = {}, deadManSwitch = {}, metadata = {} } = {}) {
    return this._request('POST', '/api/spawn', {
      name,
      spendLimits,
      deadManSwitch,
      metadata,
    });
  }

  async listAgents() {
    return this._request('GET', '/api/agents');
  }

  async getAgent(agentId) {
    return this._request('GET', `/api/agents/${agentId}`);
  }

  async terminateAgent(agentId, { reason = '' } = {}) {
    return this._request('POST', `/api/agents/${agentId}/terminate`, { reason });
  }

  async freezeAgent(agentId, { reason = '' } = {}) {
    return this._request('POST', `/api/agents/${agentId}/freeze`, { reason });
  }

  // ─── Heartbeat (Dead Man's Switch) ────────────────────────────

  /**
   * Send a heartbeat to keep an agent alive
   * Call this on an interval — if you stop, the agent is automatically terminated
   * @param {string} agentId
   */
  async heartbeat(agentId) {
    return this._request('POST', `/api/agents/${agentId}/heartbeat`);
  }

  /**
   * Helper: start automatic heartbeat on an interval
   * @param {string} agentId
   * @param {number} intervalMs - How often to ping (default: 30s)
   * @returns {function} stop - Call stop() to cancel the heartbeat
   */
  startHeartbeat(agentId, intervalMs = 30_000) {
    const timer = setInterval(() => {
      this.heartbeat(agentId).catch((err) => {
        console.error(`[AgentWallet] Heartbeat failed for ${agentId}:`, err.message);
      });
    }, intervalMs);

    return function stop() {
      clearInterval(timer);
    };
  }

  // ─── Wallets ──────────────────────────────────────────────────

  async getWallet(agentId) {
    return this._request('GET', `/api/agents/${agentId}/wallet`);
  }

  async getBalance(agentId) {
    return this._request('GET', `/api/agents/${agentId}/wallet/balance`);
  }

  // ─── Transactions ─────────────────────────────────────────────

  /**
   * Submit a transaction through governance guardrails
   * Will be blocked/approved based on your spend rules
   * @param {string} agentId
   * @param {object} tx
   * @param {number} tx.amount - Amount in dollars
   * @param {string} tx.category - Transaction category
   * @param {string} [tx.description] - Optional description
   * @param {object} [tx.metadata] - Arbitrary metadata
   */
  async transact(agentId, { amount, category, description = '', metadata = {} } = {}) {
    return this._request('POST', '/api/transactions', {
      agentId,
      amount,
      category,
      description,
      metadata,
    });
  }

  async getTransactions(agentId, { limit = 50 } = {}) {
    return this._request('GET', `/api/transactions?agentId=${agentId}&limit=${limit}`);
  }

  // ─── Rules Engine ─────────────────────────────────────────────

  /**
   * Add a spend rule
   * @param {object} rule
   * @param {string} rule.name
   * @param {'block'|'require_approval'|'allow'} rule.action
   * @param {object} rule.condition - e.g. { field: 'amount', operator: 'gt', value: 100 }
   */
  async addRule(rule) {
    return this._request('POST', '/api/rules', rule);
  }

  async listRules() {
    return this._request('GET', '/api/rules');
  }

  async deleteRule(ruleId) {
    return this._request('DELETE', `/api/rules/${ruleId}`);
  }

  // ─── Audit Log ────────────────────────────────────────────────

  async getAuditLog({ agentId = null, limit = 100 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (agentId) params.append('agentId', agentId);
    return this._request('GET', `/api/audit?${params}`);
  }

  // ─── Kill Switch ──────────────────────────────────────────────

  /**
   * Immediately terminate ALL agents (emergency stop)
   * @param {string} reason
   */
  async globalKillSwitch(reason = 'manual trigger') {
    return this._request('POST', '/api/killswitch', { reason });
  }
}

module.exports = { AgentWallet };
