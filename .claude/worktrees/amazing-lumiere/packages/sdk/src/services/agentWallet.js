/**
 * AgentWallet - JavaScript Implementation
 * Financial infrastructure for AI agents with spend controls, rules engine, and audit logging.
 * 
 * Reference: arXiv:2501.10114 "Infrastructure for AI Agents"
 */

const fs = require('fs');
const crypto = require('crypto');
const { KalshiClient } = require('./kalshiClient');

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

const ActionType = {
  GET_BALANCE: 'get_balance',
  GET_POSITIONS: 'get_positions',
  GET_MARKETS: 'get_markets',
  GET_ORDERBOOK: 'get_orderbook',
  CREATE_ORDER: 'create_order',
  CANCEL_ORDER: 'cancel_order',
  BATCH_CANCEL: 'batch_cancel',
};

const RuleResult = {
  ALLOW: 'allow',
  DENY: 'deny',
  REQUIRE_APPROVAL: 'require_approval',
};

const AuditEventType = {
  ACTION_REQUESTED: 'action_requested',
  ACTION_ALLOWED: 'action_allowed',
  ACTION_DENIED: 'action_denied',
  ACTION_EXECUTED: 'action_executed',
  ACTION_FAILED: 'action_failed',
  RULE_TRIGGERED: 'rule_triggered',
  KILL_SWITCH_ACTIVATED: 'kill_switch_activated',
  KILL_SWITCH_DEACTIVATED: 'kill_switch_deactivated',
};

// ─────────────────────────────────────────────────────────────────
// Audit Logger
// ─────────────────────────────────────────────────────────────────

class AuditLogger {
  constructor(logFile = 'agent_wallet_audit.jsonl') {
    this.logFile = logFile;
    this.events = [];
  }

  log(event) {
    this.events.push(event);
    
    // Append to file (append-only for immutability)
    fs.appendFileSync(this.logFile, JSON.stringify(event) + '\n');
  }

  createEvent({ agentId, eventType, actionType, requestData, responseData = null, ruleId = null, error = null, metadata = {} }) {
    const event = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      eventType,
      actionType,
      requestData,
      responseData,
      ruleId,
      error,
      metadata,
    };
    
    this.log(event);
    return event;
  }

  getEvents({ agentId = null, eventType = null, limit = 100 } = {}) {
    let filtered = this.events;
    
    if (agentId) {
      filtered = filtered.filter(e => e.agentId === agentId);
    }
    if (eventType) {
      filtered = filtered.filter(e => e.eventType === eventType);
    }
    
    return filtered.slice(-limit);
  }
}

// ─────────────────────────────────────────────────────────────────
// Rules Engine
// ─────────────────────────────────────────────────────────────────

class RulesEngine {
  constructor() {
    this.rules = new Map();
  }

  addRule(rule) {
    this.rules.set(rule.ruleId, rule);
  }

  removeRule(ruleId) {
    this.rules.delete(ruleId);
  }

  evaluate(context, auditLogger = null, agentId = null) {
    // Sort by priority (highest first)
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.isActive)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      try {
        if (rule.condition(context)) {
          if (auditLogger && agentId) {
            auditLogger.createEvent({
              agentId,
              eventType: AuditEventType.RULE_TRIGGERED,
              actionType: context.actionType,
              requestData: context,
              ruleId: rule.ruleId,
              metadata: { ruleName: rule.name, result: rule.action },
            });
          }
          return { result: rule.action, ruleId: rule.ruleId };
        }
      } catch (e) {
        console.error(`Rule ${rule.ruleId} evaluation failed:`, e.message);
      }
    }

    return { result: RuleResult.ALLOW, ruleId: null };
  }
}

// ─────────────────────────────────────────────────────────────────
// Spend Tracker
// ─────────────────────────────────────────────────────────────────

class SpendTracker {
  constructor() {
    // agentId -> Array<{ timestamp: Date, amount: number }>
    this.transactions = new Map();
  }

  recordSpend(agentId, amountCents) {
    if (!this.transactions.has(agentId)) {
      this.transactions.set(agentId, []);
    }
    this.transactions.get(agentId).push({
      timestamp: new Date(),
      amount: amountCents,
    });
  }

  getSpend(agentId, since) {
    const txns = this.transactions.get(agentId) || [];
    return txns
      .filter(t => t.timestamp >= since)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  getDailySpend(agentId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.getSpend(agentId, since);
  }

  getWeeklySpend(agentId) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.getSpend(agentId, since);
  }
}

// ─────────────────────────────────────────────────────────────────
// Agent Wallet
// ─────────────────────────────────────────────────────────────────

class AgentWallet {
  constructor({ agent, kalshiClient, spendLimit, rulesEngine, auditLogger, spendTracker }) {
    this.agent = agent;
    this.client = kalshiClient;
    this.spendLimit = spendLimit;
    this.rulesEngine = rulesEngine;
    this.auditLogger = auditLogger;
    this.spendTracker = spendTracker;
    this._killSwitchActive = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Kill Switch
  // ─────────────────────────────────────────────────────────────

  async activateKillSwitch(reason = '') {
    this._killSwitchActive = true;

    this.auditLogger.createEvent({
      agentId: this.agent.agentId,
      eventType: AuditEventType.KILL_SWITCH_ACTIVATED,
      actionType: null,
      requestData: { reason },
    });

    try {
      const result = await this.client.batchCancelOrders();
      return { status: 'kill_switch_activated', ordersCancelled: result };
    } catch (e) {
      return { status: 'kill_switch_activated', cancelError: e.message };
    }
  }

  deactivateKillSwitch() {
    this._killSwitchActive = false;

    this.auditLogger.createEvent({
      agentId: this.agent.agentId,
      eventType: AuditEventType.KILL_SWITCH_DEACTIVATED,
      actionType: null,
      requestData: {},
    });
  }

  get isKillSwitchActive() {
    return this._killSwitchActive;
  }

  // ─────────────────────────────────────────────────────────────
  // Controls Check
  // ─────────────────────────────────────────────────────────────

  _checkControls(actionType, requestData) {
    // Kill switch
    if (this._killSwitchActive) {
      return { allowed: false, reason: 'Kill switch is active' };
    }

    // Agent active
    if (!this.agent.isActive) {
      return { allowed: false, reason: 'Agent is deactivated' };
    }

    // Build context
    const context = {
      actionType,
      requestData,
      agent: this.agent,
      spendLimit: this.spendLimit,
      dailySpend: this.spendTracker.getDailySpend(this.agent.agentId),
      weeklySpend: this.spendTracker.getWeeklySpend(this.agent.agentId),
    };

    // Order-specific checks
    if (actionType === ActionType.CREATE_ORDER) {
      const { ticker, yesPrice, noPrice, count } = requestData;
      const price = yesPrice || noPrice || 0;
      const orderValue = price * count;

      context.ticker = ticker;
      context.orderValue = orderValue;
      context.count = count;

      // Spend limit checks
      if (orderValue > this.spendLimit.maxPerOrder) {
        return { allowed: false, reason: `Order value ${orderValue} exceeds maxPerOrder ${this.spendLimit.maxPerOrder}` };
      }

      if (context.dailySpend + orderValue > this.spendLimit.maxPerDay) {
        return { allowed: false, reason: `Would exceed daily spend limit of ${this.spendLimit.maxPerDay}` };
      }

      if (context.weeklySpend + orderValue > this.spendLimit.maxPerWeek) {
        return { allowed: false, reason: `Would exceed weekly spend limit of ${this.spendLimit.maxPerWeek}` };
      }

      if (count > this.spendLimit.maxPositionSize) {
        return { allowed: false, reason: `Position size ${count} exceeds max ${this.spendLimit.maxPositionSize}` };
      }

      // Ticker restrictions
      if (this.spendLimit.allowedTickers && !this.spendLimit.allowedTickers.includes(ticker)) {
        return { allowed: false, reason: `Ticker ${ticker} not in allowed list` };
      }

      if (this.spendLimit.blockedTickers?.includes(ticker)) {
        return { allowed: false, reason: `Ticker ${ticker} is blocked` };
      }
    }

    // Rules engine
    const { result, ruleId } = this.rulesEngine.evaluate(context, this.auditLogger, this.agent.agentId);

    if (result === RuleResult.DENY) {
      return { allowed: false, reason: `Denied by rule: ${ruleId}` };
    }

    if (result === RuleResult.REQUIRE_APPROVAL) {
      return { allowed: false, reason: `Requires approval (rule: ${ruleId})` };
    }

    return { allowed: true, reason: null };
  }

  // ─────────────────────────────────────────────────────────────
  // Execute Action
  // ─────────────────────────────────────────────────────────────

  async _executeAction(actionType, requestData, actionFn) {
    // Log request
    this.auditLogger.createEvent({
      agentId: this.agent.agentId,
      eventType: AuditEventType.ACTION_REQUESTED,
      actionType,
      requestData,
    });

    // Check controls
    const { allowed, reason } = this._checkControls(actionType, requestData);

    if (!allowed) {
      this.auditLogger.createEvent({
        agentId: this.agent.agentId,
        eventType: AuditEventType.ACTION_DENIED,
        actionType,
        requestData,
        error: reason,
      });
      
      const error = new Error(reason);
      error.code = 'PERMISSION_DENIED';
      throw error;
    }

    // Log allowed
    this.auditLogger.createEvent({
      agentId: this.agent.agentId,
      eventType: AuditEventType.ACTION_ALLOWED,
      actionType,
      requestData,
    });

    // Execute
    try {
      const result = await actionFn();

      // Track spend for orders
      if (actionType === ActionType.CREATE_ORDER) {
        const price = requestData.yesPrice || requestData.noPrice || 0;
        this.spendTracker.recordSpend(this.agent.agentId, price * requestData.count);
      }

      // Log success
      this.auditLogger.createEvent({
        agentId: this.agent.agentId,
        eventType: AuditEventType.ACTION_EXECUTED,
        actionType,
        requestData,
        responseData: result,
      });

      return result;
    } catch (e) {
      this.auditLogger.createEvent({
        agentId: this.agent.agentId,
        eventType: AuditEventType.ACTION_FAILED,
        actionType,
        requestData,
        error: e.message,
      });
      throw e;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Read Operations
  // ─────────────────────────────────────────────────────────────

  async getBalance() {
    return this._executeAction(
      ActionType.GET_BALANCE,
      {},
      () => this.client.getBalance()
    );
  }

  async getPositions(limit = 100) {
    return this._executeAction(
      ActionType.GET_POSITIONS,
      { limit },
      () => this.client.getPositions(limit)
    );
  }

  async getMarkets({ status, limit = 100 } = {}) {
    return this._executeAction(
      ActionType.GET_MARKETS,
      { status, limit },
      () => this.client.getMarkets({ status, limit })
    );
  }

  async getOrderbook(ticker, depth = 10) {
    return this._executeAction(
      ActionType.GET_ORDERBOOK,
      { ticker, depth },
      () => this.client.getOrderbook(ticker, depth)
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Write Operations
  // ─────────────────────────────────────────────────────────────

  async createOrder({ ticker, side, action, count, type = 'limit', yesPrice, noPrice, clientOrderId }) {
    const requestData = { ticker, side, action, count, type, yesPrice, noPrice };

    return this._executeAction(
      ActionType.CREATE_ORDER,
      requestData,
      () => this.client.createOrder({ ticker, side, action, count, type, yesPrice, noPrice, clientOrderId })
    );
  }

  async cancelOrder(orderId) {
    return this._executeAction(
      ActionType.CANCEL_ORDER,
      { orderId },
      () => this.client.cancelOrder(orderId)
    );
  }

  async cancelAllOrders(ticker = null) {
    return this._executeAction(
      ActionType.BATCH_CANCEL,
      { ticker },
      () => this.client.batchCancelOrders(ticker)
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Agent Wallet Manager
// ─────────────────────────────────────────────────────────────────

class AgentWalletManager {
  constructor({ kalshiApiKeyId, kalshiPrivateKeyPath, auditLogFile = 'agent_wallet_audit.jsonl' }) {
    this.kalshiClient = new KalshiClient({
      apiKeyId: kalshiApiKeyId,
      privateKeyPath: kalshiPrivateKeyPath,
    });

    this.auditLogger = new AuditLogger(auditLogFile);
    this.rulesEngine = new RulesEngine();
    this.spendTracker = new SpendTracker();

    this.agents = new Map();
    this.wallets = new Map();

    this._setupDefaultRules();
  }

  _setupDefaultRules() {
    // Block very large orders (>$100)
    this.rulesEngine.addRule({
      ruleId: 'default_max_order_value',
      name: 'Maximum Order Value',
      description: 'Block orders over $100',
      condition: (ctx) => (ctx.orderValue || 0) > 10000,
      action: RuleResult.DENY,
      priority: 100,
      isActive: true,
    });

    // Require approval for orders over $50
    this.rulesEngine.addRule({
      ruleId: 'default_approval_threshold',
      name: 'Approval Threshold',
      description: 'Require approval for orders over $50',
      condition: (ctx) => (ctx.orderValue || 0) > 5000,
      action: RuleResult.REQUIRE_APPROVAL,
      priority: 50,
      isActive: true,
    });
  }

  createAgent({ name, description = '', spendLimit = null, metadata = {} }) {
    const agent = {
      agentId: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      metadata,
      isActive: true,
    };

    this.agents.set(agent.agentId, agent);

    // Default spend limits
    const limits = spendLimit || {
      maxPerOrder: 5000,      // $50
      maxPerDay: 20000,       // $200
      maxPerWeek: 50000,      // $500
      maxPositionSize: 100,
      allowedTickers: null,
      blockedTickers: [],
    };

    const wallet = new AgentWallet({
      agent,
      kalshiClient: this.kalshiClient,
      spendLimit: limits,
      rulesEngine: this.rulesEngine,
      auditLogger: this.auditLogger,
      spendTracker: this.spendTracker,
    });

    this.wallets.set(agent.agentId, wallet);

    return agent;
  }

  getWallet(agentId) {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet for agent ${agentId}`);
    }
    return wallet;
  }

  deactivateAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isActive = false;
    }
  }

  activateAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isActive = true;
    }
  }

  async globalKillSwitch(reason = '') {
    const results = {};
    for (const [agentId, wallet] of this.wallets) {
      results[agentId] = await wallet.activateKillSwitch(reason);
    }
    return results;
  }

  addRule(rule) {
    this.rulesEngine.addRule(rule);
  }

  getAuditLog({ agentId = null, limit = 100 } = {}) {
    return this.auditLogger.getEvents({ agentId, limit });
  }
}

// ─────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────

module.exports = {
  AgentWalletManager,
  AgentWallet,
  RulesEngine,
  AuditLogger,
  SpendTracker,
  ActionType,
  RuleResult,
  AuditEventType,
};

// ─────────────────────────────────────────────────────────────────
// Test if run directly
// ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    try {
      console.log('='.repeat(60));
      console.log('AgentWallet JS - Test');
      console.log('='.repeat(60));

      const manager = new AgentWalletManager({
        kalshiApiKeyId: process.env.KALSHI_API_KEY_ID || 'Ce00cf3a-1002-4eab-aa9c-b69560921052',
        kalshiPrivateKeyPath: '~/.kalshi/private_key.pem',
      });

      // Create agent
      const agent = manager.createAgent({
        name: 'js-test-agent',
        description: 'Testing JS implementation',
        spendLimit: {
          maxPerOrder: 2500,
          maxPerDay: 10000,
          maxPerWeek: 25000,
          maxPositionSize: 50,
        },
      });
      console.log(`\n✅ Created agent: ${agent.agentId}`);

      const wallet = manager.getWallet(agent.agentId);

      // Get balance
      const balance = await wallet.getBalance();
      console.log(`✅ Balance: $${(balance.balance / 100).toFixed(2)}`);

      // Get positions
      const positions = await wallet.getPositions();
      console.log(`✅ Positions: ${positions.positions?.length || 0}`);

      // Try an order that will be blocked (too expensive)
      console.log('\n🧪 Testing spend controls...');
      try {
        await wallet.createOrder({
          ticker: 'TEST-TICKER',
          side: 'yes',
          action: 'buy',
          count: 100,
          yesPrice: 60, // 60 * 100 = 6000 cents = $60 > $50 threshold
        });
        console.log('❌ Order should have required approval!');
      } catch (e) {
        if (e.message.includes('Requires approval')) {
          console.log(`✅ Correctly blocked: ${e.message}`);
        } else {
          console.log(`❌ Unexpected error: ${e.message}`);
        }
      }

      // Audit log
      console.log('\n📋 Audit Log:');
      for (const event of manager.getAuditLog({ limit: 5 })) {
        console.log(`  [${event.eventType}] ${event.actionType || '-'}`);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ AgentWallet JS working!');
      console.log('='.repeat(60));

    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}
