/**
 * CoinbaseAgenticWalletAdapter — AgentWallet V2, Feature 4
 *
 * Wraps Coinbase's Agentic Wallet SDK with AgentWallet's full governance layer.
 * Every transaction passes through: kill switch → policy engine → cross-agent check → Coinbase.
 *
 * References Coinbase Agentic Wallets (launched Feb 11, 2026) on Base network.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class CoinbaseAgenticWalletAdapter {
  /**
   * @param {object} opts
   * @param {object} opts.deadManSwitch   - DeadManSwitch service instance
   * @param {object} opts.rulesEngine     - RulesEngine service instance
   * @param {object} opts.crossAgentGov   - CrossAgentGovernor service instance
   * @param {object} opts.spawnGovernor   - SpawnGovernor service instance
   * @param {string} opts.coinbaseApiKey
   * @param {string} opts.coinbaseApiSecret
   * @param {string} opts.network         - base-mainnet | base-sepolia
   */
  constructor({
    deadManSwitch,
    rulesEngine,
    crossAgentGov,
    spawnGovernor,
    coinbaseApiKey = process.env.COINBASE_API_KEY,
    coinbaseApiSecret = process.env.COINBASE_API_SECRET,
    network = 'base-mainnet',
  }) {
    this.dms = deadManSwitch;
    this.rules = rulesEngine;
    this.crossAgent = crossAgentGov;
    this.spawn = spawnGovernor;
    this.network = network;
    this.apiKey = coinbaseApiKey;
    this.apiSecret = coinbaseApiSecret;
    this.baseUrl = 'https://api.developer.coinbase.com/platform';
  }

  // ─────────────────────────────────────────────────────────────
  // WALLET CREATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a Coinbase agentic wallet with AgentWallet governance attached.
   */
  async createWallet(agentId, { parentAgentId = null } = {}) {
    // If spawned child, check spawn authorization first
    if (parentAgentId) {
      const spawnResult = await this.spawn.authorizeSpawn(parentAgentId, agentId);
      if (!spawnResult.authorized) {
        return { success: false, reason: spawnResult.reason };
      }
    }

    // Call Coinbase API to create wallet
    const walletData = await this._coinbaseRequest('POST', '/v1/wallets', {
      network: this.network,
      type: 'agentic',
    });

    if (!walletData) {
      return { success: false, reason: 'Failed to create Coinbase wallet' };
    }

    // Store wallet reference in our DB
    const wallet = await prisma.wallet.create({
      data: {
        agentId,
        balance: 0,
        currency: 'USDC',
        status: 'ACTIVE',
      },
    });

    // Register in dead man's switch
    await this.dms.registerAgent(agentId, {
      heartbeatIntervalSeconds: 30,
      anomalySpendMultiplier: 3.0,
    });

    // Store Coinbase metadata
    await prisma.agent.updateMany({
      where: { id: agentId },
      data: {
        metadata: {
          coinbaseWalletId: walletData.id,
          walletAddress: walletData.address,
          network: this.network,
          rail: 'coinbase_agentic',
        },
      },
    });

    return {
      success: true,
      agentId,
      walletId: wallet.id,
      coinbaseWalletId: walletData.id,
      address: walletData.address,
      network: this.network,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SEND TRANSACTION (the core integration point)
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a governed transaction via Coinbase.
   * Gate order: DeadManSwitch → RulesEngine → CrossAgentCheck → Coinbase
   */
  async sendTransaction(agentId, { toAddress, amount, currency = 'USDC', purpose = '', metadata = {} }) {
    // Step 1: Dead man's switch gate
    const switchEval = await this.dms.evaluateTransaction(agentId, amount);
    if (!switchEval.allow) {
      return { success: false, blockedBy: 'kill_switch', reason: switchEval.reason };
    }

    // Step 2: Policy/rules engine check
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    const wallets = await prisma.wallet.findMany({ where: { agentId } });

    if (!wallets.length) {
      return { success: false, reason: 'No wallet found for agent' };
    }

    const wallet = wallets[0];
    const policyResult = await this.rules.evaluateTransaction(wallet.id, {
      amount,
      category: purpose,
      recipientId: toAddress,
      metadata: { ...metadata, rail: 'coinbase_agentic' },
    });

    if (!policyResult.approved) {
      return {
        success: false,
        blockedBy: 'policy_engine',
        reason: policyResult.results?.find((r) => !r.passed)?.reason || 'Policy check failed',
        requiresHuman: policyResult.requiresApproval,
      };
    }

    // Step 3: Cross-agent check (if toAddress belongs to a known agent)
    const targetAgent = await prisma.agent.findFirst({
      where: { metadata: { path: ['walletAddress'], equals: toAddress } },
    });

    if (targetAgent) {
      const crossResult = await this.crossAgent.authorizeTransaction({
        sourceAgentId: agentId,
        targetAgentId: targetAgent.id,
        amount,
        paymentType: purpose || 'transfer',
        metadata: { ...metadata, rail: 'coinbase_agentic' },
      });

      if (!crossResult.authorized) {
        return {
          success: false,
          blockedBy: 'cross_agent_policy',
          reason: crossResult.reason,
          requiresHuman: crossResult.requiresHuman,
        };
      }
    }

    // Step 4: Execute via Coinbase
    const coinbaseMeta = agent?.metadata || {};
    const coinbaseWalletId = coinbaseMeta.coinbaseWalletId;

    if (!coinbaseWalletId) {
      return { success: false, reason: 'No Coinbase wallet linked to this agent' };
    }

    const txData = await this._coinbaseRequest('POST', `/v1/wallets/${coinbaseWalletId}/transfers`, {
      amount: String(amount),
      asset: currency,
      destination: toAddress,
      gasless: true, // Coinbase agentic wallets are gasless on Base
    });

    if (!txData) {
      return { success: false, reason: 'Coinbase transaction failed' };
    }

    // Step 5: Record in our audit log
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        currency,
        recipientId: toAddress,
        recipientType: targetAgent ? 'AGENT_WALLET' : 'EXTERNAL',
        description: purpose,
        status: 'COMPLETED',
        metadata: {
          rail: 'coinbase_agentic',
          coinbaseTransferId: txData.id,
          txHash: txData.transaction_hash,
          purpose,
          ...metadata,
        },
      },
    });

    return {
      success: true,
      txHash: txData.transaction_hash,
      coinbaseTransferId: txData.id,
      agentId,
      amount,
      currency,
      toAddress,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // BALANCE
  // ─────────────────────────────────────────────────────────────

  async getBalance(agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    const coinbaseWalletId = agent?.metadata?.coinbaseWalletId;

    if (!coinbaseWalletId) {
      return { error: 'No Coinbase wallet linked to this agent' };
    }

    const balances = await this._coinbaseRequest('GET', `/v1/wallets/${coinbaseWalletId}/balances`);

    // Enrich with governance context
    const wallet = await prisma.wallet.findFirst({ where: { agentId } });
    const health = wallet ? await this.dms.getHealth(agentId) : null;

    return {
      balances: balances || [],
      governance: {
        agentStatus: health?.status || 'unknown',
        lastHeartbeat: health?.lastHeartbeatAt,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE: COINBASE API CALL
  // ─────────────────────────────────────────────────────────────

  async _coinbaseRequest(method, path, body = null) {
    // In production, use the actual Coinbase SDK / CDP API
    // This stub returns mock data in dev/test; replace with real HTTP calls
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[CoinbaseAdapter] ${method} ${path}`, body || '');
      return this._mockCoinbaseResponse(method, path, body);
    }

    const { default: fetch } = await import('node-fetch');
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) {
      console.error(`[CoinbaseAdapter] ${method} ${path} failed:`, await res.text());
      return null;
    }
    return res.json();
  }

  _mockCoinbaseResponse(method, path, body) {
    const { v4: uuidv4 } = require('uuid');
    if (path === '/v1/wallets' && method === 'POST') {
      return { id: `cb_wallet_${uuidv4()}`, address: `0x${uuidv4().replace(/-/g, '')}` };
    }
    if (path.includes('/transfers') && method === 'POST') {
      return { id: `cb_transfer_${uuidv4()}`, transaction_hash: `0x${uuidv4().replace(/-/g, '')}` };
    }
    if (path.includes('/balances')) {
      return [{ asset: 'USDC', amount: '100.00' }];
    }
    return {};
  }
}

module.exports = CoinbaseAgenticWalletAdapter;
