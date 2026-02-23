/**
 * StripeX402Proxy — AgentWallet V2, Feature 5
 *
 * Intercepts HTTP 402 Payment Required responses and runs them through
 * AgentWallet's governance layer before allowing payment via Stripe's x402 protocol.
 *
 * Architecture:
 *   Agent → [Target Service returns 402] → [This proxy evaluates] → Stripe x402 → Retry request
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class StripeX402Proxy {
  /**
   * @param {object} opts
   * @param {object} opts.deadManSwitch  - DeadManSwitch service instance
   * @param {object} opts.rulesEngine    - RulesEngine service instance
   * @param {string} opts.stripeApiKey
   */
  constructor({ deadManSwitch, rulesEngine, stripeApiKey = process.env.STRIPE_SECRET_KEY }) {
    this.dms = deadManSwitch;
    this.rules = rulesEngine;
    this.stripeApiKey = stripeApiKey;
    this.stripeBase = 'https://api.stripe.com';
  }

  // ─────────────────────────────────────────────────────────────
  // PROXY REQUEST
  // ─────────────────────────────────────────────────────────────

  /**
   * Make an HTTP request on behalf of an agent.
   * If the service returns 402, evaluate governance before paying.
   */
  async request(agentId, method, url, opts = {}) {
    // Make the initial request
    const response = await this._httpRequest(method, url, opts);

    // Not a payment-gated endpoint — pass through
    if (response.status !== 402) {
      return {
        status: response.status,
        body: response.body,
        paymentRequired: false,
      };
    }

    // ── 402 Payment Required ──────────────────────────────────
    const paymentDetails = this._parseX402Response(response);

    if (!paymentDetails) {
      return {
        status: 402,
        paymentRequired: true,
        paymentBlocked: true,
        reason: 'Unable to parse x402 payment details from response',
      };
    }

    const { amount, currency, description, pricingModel } = paymentDetails;
    const vendor = this._extractVendor(url);

    // Step 1: Kill switch gate
    const switchEval = await this.dms.evaluateTransaction(agentId, amount, vendor);
    if (!switchEval.allow) {
      return {
        status: 402,
        paymentRequired: true,
        paymentBlocked: true,
        reason: `Kill switch: ${switchEval.reason}`,
      };
    }

    // Step 2: Policy/rules engine check
    const agentWallets = await prisma.wallet.findMany({ where: { agentId } });
    if (!agentWallets.length) {
      return { status: 402, paymentRequired: true, paymentBlocked: true, reason: 'No wallet found for agent' };
    }
    const wallet = agentWallets[0];

    const policyResult = await this.rules.evaluateTransaction(wallet.id, {
      amount,
      category: 'x402_service_payment',
      recipientId: vendor,
      metadata: { url, service: description, pricingModel, rail: 'stripe_x402' },
    });

    if (!policyResult.approved) {
      return {
        status: 402,
        paymentRequired: true,
        paymentBlocked: true,
        reason: policyResult.results?.find((r) => !r.passed)?.reason || 'Policy blocked x402 payment',
        requiresHuman: policyResult.requiresApproval,
      };
    }

    // Step 3: Check service allowlist
    const allowed = await this._isServiceAllowed(agentId, vendor);
    if (!allowed) {
      return {
        status: 402,
        paymentRequired: true,
        paymentBlocked: true,
        reason: `Service '${vendor}' is not in x402 allowlist for this agent`,
      };
    }

    // Step 4: Execute payment via Stripe
    const stripeResult = await this._stripeCreatePaymentIntent(agentId, url, amount, policyResult);
    if (!stripeResult.success) {
      return { status: 402, paymentRequired: true, paymentBlocked: true, reason: stripeResult.error };
    }

    // Step 5: Record in audit log
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        currency: currency || 'USDC',
        recipientId: vendor,
        recipientType: 'EXTERNAL',
        description: description || `x402 payment to ${vendor}`,
        status: 'COMPLETED',
        metadata: {
          rail: 'stripe_x402',
          stripePaymentIntentId: stripeResult.paymentIntentId,
          url,
          pricingModel,
        },
      },
    });

    // Step 6: Retry the original request with payment proof
    const paidResponse = await this._httpRequest(method, url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        'X-Payment-Proof': stripeResult.paymentIntentId,
        'X-Payment-Protocol': 'x402',
      },
    });

    return {
      status: paidResponse.status,
      body: paidResponse.body,
      paymentRequired: true,
      paymentCompleted: true,
      amountPaid: amount,
      currency: currency || 'USDC',
      stripePaymentId: stripeResult.paymentIntentId,
      vendor,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SERVICE ALLOWLIST MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  async addServiceToAllowlist(agentId, { domain, maxPerRequest, maxDaily, pricingModels = ['per_request'] }) {
    // Store as a spend rule with x402 category
    const wallet = await prisma.wallet.findFirst({ where: { agentId } });
    if (!wallet) throw new Error('No wallet found for agent');

    // Check if allowlist rule already exists
    const existing = await prisma.spendRule.findFirst({
      where: {
        walletId: wallet.id,
        ruleType: 'RECIPIENT_WHITELIST',
        active: true,
      },
    });

    if (existing) {
      const params = existing.parameters || {};
      const domains = params.x402Domains || [];
      if (!domains.find((d) => d.domain === domain)) {
        domains.push({ domain, maxPerRequest, maxDaily, pricingModels });
        await prisma.spendRule.update({
          where: { id: existing.id },
          data: { parameters: { ...params, x402Domains: domains } },
        });
      }
      return existing;
    }

    return prisma.spendRule.create({
      data: {
        walletId: wallet.id,
        ruleType: 'RECIPIENT_WHITELIST',
        priority: 10,
        parameters: {
          x402Domains: [{ domain, maxPerRequest, maxDaily, pricingModels }],
        },
      },
    });
  }

  async listAllowedServices(agentId) {
    const wallet = await prisma.wallet.findFirst({ where: { agentId } });
    if (!wallet) return [];

    const rule = await prisma.spendRule.findFirst({
      where: { walletId: wallet.id, ruleType: 'RECIPIENT_WHITELIST', active: true },
    });

    return rule?.parameters?.x402Domains || [];
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  async _isServiceAllowed(agentId, domain) {
    const allowed = await this.listAllowedServices(agentId);
    // If no allowlist configured, deny by default (secure by default)
    if (allowed.length === 0) return false;
    return allowed.some((s) => s.domain === domain || domain.endsWith(`.${s.domain}`));
  }

  _parseX402Response(response) {
    const headers = response.headers || {};

    // x402 protocol: payment info in response headers
    if (headers['x-payment-amount']) {
      return {
        amount: parseFloat(headers['x-payment-amount']),
        currency: headers['x-payment-currency'] || 'USDC',
        description: headers['x-payment-description'] || '',
        pricingModel: headers['x-pricing-model'] || 'per_request',
        network: headers['x-payment-network'] || 'base',
      };
    }

    // Fallback: try JSON body
    try {
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      return body?.payment || null;
    } catch {
      return null;
    }
  }

  _extractVendor(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  async _stripeCreatePaymentIntent(agentId, url, amount, policyResult) {
    if (process.env.NODE_ENV !== 'production') {
      const { v4: uuidv4 } = require('uuid');
      console.log(`[StripeX402] Mock payment: $${amount} for ${url}`);
      return { success: true, paymentIntentId: `pi_mock_${uuidv4()}` };
    }

    try {
      const { default: fetch } = await import('node-fetch');
      const body = new URLSearchParams({
        amount: String(Math.round(parseFloat(amount) * 100)),
        currency: 'usd',
        'payment_method_types[]': 'x402',
        'metadata[agent_id]': agentId,
        'metadata[service_url]': url,
        'metadata[governance_policy_id]': policyResult.policyId || '',
      });

      const res = await fetch(`${this.stripeBase}/v1/payment_intents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Stripe error: ${err}` };
      }

      const data = await res.json();
      return { success: true, paymentIntentId: data.id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _httpRequest(method, url, opts = {}) {
    if (process.env.NODE_ENV !== 'production') {
      // Mock: simulate various responses
      return { status: 200, body: '{"success": true}', headers: {} };
    }

    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url, { method, headers: opts.headers || {}, body: opts.body });
    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k.toLowerCase()] = v;

    return {
      status: res.status,
      body: await res.text(),
      headers,
    };
  }
}

module.exports = StripeX402Proxy;
