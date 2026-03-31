/**
 * CrossAgentGovernor — AgentWallet V2, Feature 2
 *
 * Governs transactions between agents.
 * Policy resolution order: exact match > group match > wildcard.
 * Supports immediate, batched, and escrow settlement modes.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class CrossAgentGovernor {
  constructor({ notificationHandler } = {}) {
    this.notify = notificationHandler || null;
  }

  // ─────────────────────────────────────────────────────────────
  // AUTHORIZE CROSS-AGENT TRANSACTION
  // ─────────────────────────────────────────────────────────────

  async authorizeTransaction({
    sourceAgentId,
    targetAgentId,
    amount,
    paymentType,
    description = '',
    metadata = {},
  }) {
    // 1. Resolve the most specific applicable policy
    const policy = await this._resolvePolicy(sourceAgentId, targetAgentId);

    if (!policy) {
      const tx = await this._recordTransaction({
        sourceAgentId,
        targetAgentId,
        amount,
        paymentType,
        description,
        authorized: false,
        authorizationMethod: 'auto',
        requiresHuman: true,
        metadata,
      });
      return {
        authorized: false,
        requiresHuman: true,
        reason: 'No cross-agent policy found for this pair',
        transactionId: tx.id,
      };
    }

    // 2. Check mutual policy requirement
    if (policy.requireMutualPolicy) {
      const targetPolicy = await this._resolvePolicy(targetAgentId, sourceAgentId);
      if (!targetPolicy) {
        return {
          authorized: false,
          reason: 'Counterparty has no reciprocal cross-agent policy',
        };
      }
    }

    // 3. Run all checks
    const checks = await Promise.all([
      this._checkPaymentType(policy, paymentType),
      this._checkPerTxLimit(policy, amount),
      this._checkDailyTargetLimit(policy, sourceAgentId, targetAgentId, amount),
      this._checkDailyGlobalLimit(policy, sourceAgentId, amount),
      this._checkCounterpartyTrust(policy, targetAgentId),
    ]);

    const failed = checks.find((c) => !c.passed);
    if (failed) {
      await this._recordTransaction({
        sourceAgentId, targetAgentId, amount, paymentType, description,
        policyId: policy.id, authorized: false, authorizationMethod: 'auto', metadata,
      });
      return { authorized: false, reason: failed.reason, checks };
    }

    // 4. Escalate to human if above threshold
    const amountNum = parseFloat(amount);
    const threshold = parseFloat(policy.requireHumanApprovalAbove);
    if (amountNum > threshold) {
      const tx = await this._recordTransaction({
        sourceAgentId, targetAgentId, amount, paymentType, description,
        policyId: policy.id, authorized: false, authorizationMethod: 'escalated',
        requiresHuman: true, metadata,
      });

      if (this.notify) {
        await this.notify.sendAlert(sourceAgentId, 'cross_agent_escalation', {
          targetAgentId, amount, paymentType, threshold,
        });
      }

      return {
        authorized: false,
        requiresHuman: true,
        transactionId: tx.id,
        reason: `Amount $${amountNum} exceeds auto-approve threshold $${threshold}`,
      };
    }

    // 5. Authorized — record and return
    const tx = await this._recordTransaction({
      sourceAgentId, targetAgentId, amount, paymentType, description,
      policyId: policy.id, authorized: true, authorizationMethod: 'auto',
      settlementMode: policy.settlementMode, metadata,
    });

    return {
      authorized: true,
      transactionId: tx.id,
      settlementMode: policy.settlementMode,
      policyId: policy.id,
      checks,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // POLICY MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  async createPolicy(ownerId, params) {
    return prisma.crossAgentPolicy.create({
      data: {
        ownerId,
        sourceAgentId: params.sourceAgentId,
        targetAgentId: params.targetAgentId || null,
        targetAgentGroup: params.targetAgentGroup || null,
        maxPerTransaction: params.maxPerTransaction ?? 100,
        maxDailyToTarget: params.maxDailyToTarget ?? 1000,
        maxDailyAllAgents: params.maxDailyAllAgents ?? 5000,
        requireHumanApprovalAbove: params.requireHumanApprovalAbove ?? 500,
        allowedPaymentTypes: params.allowedPaymentTypes ?? ['compute', 'data', 'api_call', 'service'],
        requireMutualPolicy: params.requireMutualPolicy ?? true,
        settlementMode: params.settlementMode ?? 'immediate',
        minCounterpartyTrustScore: params.minCounterpartyTrustScore ?? 0,
      },
    });
  }

  async listPolicies(ownerId, sourceAgentId = null) {
    return prisma.crossAgentPolicy.findMany({
      where: {
        ownerId,
        ...(sourceAgentId && { sourceAgentId }),
        enabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePolicy(policyId, ownerId, updates) {
    return prisma.crossAgentPolicy.updateMany({
      where: { id: policyId, ownerId },
      data: updates,
    });
  }

  async deletePolicy(policyId, ownerId) {
    return prisma.crossAgentPolicy.updateMany({
      where: { id: policyId, ownerId },
      data: { enabled: false },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION HISTORY
  // ─────────────────────────────────────────────────────────────

  async getTransactionHistory(agentId, { limit = 50, since = null } = {}) {
    return prisma.crossAgentTransaction.findMany({
      where: {
        OR: [{ sourceAgentId: agentId }, { targetAgentId: agentId }],
        ...(since && { createdAt: { gte: new Date(since) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Human approval (owner approves a held transaction)
  async approveTransaction(transactionId, operatorId) {
    const tx = await prisma.crossAgentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) return { success: false, reason: 'Transaction not found' };
    if (!tx.requiresHuman) return { success: false, reason: 'Transaction does not require approval' };

    await prisma.crossAgentTransaction.update({
      where: { id: transactionId },
      data: {
        authorized: true,
        authorizationMethod: 'human_approved',
        requiresHuman: false,
        metadata: { ...(tx.metadata || {}), approvedBy: operatorId, approvedAt: new Date().toISOString() },
      },
    });

    return { success: true, transactionId };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Priority: exact (source→target) > group > wildcard (source→any)
   */
  async _resolvePolicy(sourceId, targetId) {
    // 1. Exact match
    const exact = await prisma.crossAgentPolicy.findFirst({
      where: { sourceAgentId: sourceId, targetAgentId: targetId, enabled: true },
    });
    if (exact) return exact;

    // 2. Group match — look up what groups the target belongs to
    const targetGroups = await prisma.agentGroup.findMany({
      where: { agentIds: { has: targetId } },
    });
    for (const group of targetGroups) {
      const groupPolicy = await prisma.crossAgentPolicy.findFirst({
        where: { sourceAgentId: sourceId, targetAgentGroup: group.name, enabled: true },
      });
      if (groupPolicy) return groupPolicy;
    }

    // 3. Wildcard
    const wildcard = await prisma.crossAgentPolicy.findFirst({
      where: { sourceAgentId: sourceId, targetAgentId: null, targetAgentGroup: null, enabled: true },
    });
    return wildcard || null;
  }

  _checkPaymentType(policy, paymentType) {
    const allowed = policy.allowedPaymentTypes || [];
    if (!allowed.includes(paymentType)) {
      return { passed: false, reason: `Payment type '${paymentType}' not in allowed types: [${allowed.join(', ')}]` };
    }
    return { passed: true, check: 'payment_type' };
  }

  _checkPerTxLimit(policy, amount) {
    const limit = parseFloat(policy.maxPerTransaction);
    if (parseFloat(amount) > limit) {
      return { passed: false, reason: `Amount $${amount} exceeds per-transaction limit $${limit}` };
    }
    return { passed: true, check: 'per_tx_limit', limit };
  }

  async _checkDailyTargetLimit(policy, sourceId, targetId, amount) {
    const windowStart = new Date(Date.now() - 86400000);
    const result = await prisma.crossAgentTransaction.aggregate({
      where: { sourceAgentId: sourceId, targetAgentId: targetId, createdAt: { gte: windowStart }, authorized: true },
      _sum: { amount: true },
    });
    const spent = parseFloat(result._sum.amount || 0);
    const limit = parseFloat(policy.maxDailyToTarget);
    if (spent + parseFloat(amount) > limit) {
      return {
        passed: false,
        reason: `Daily limit to this counterparty exceeded ($${spent.toFixed(2)} spent, $${limit} limit)`,
      };
    }
    return { passed: true, check: 'daily_target_limit', spent, limit };
  }

  async _checkDailyGlobalLimit(policy, sourceId, amount) {
    const windowStart = new Date(Date.now() - 86400000);
    const result = await prisma.crossAgentTransaction.aggregate({
      where: { sourceAgentId: sourceId, createdAt: { gte: windowStart }, authorized: true },
      _sum: { amount: true },
    });
    const spent = parseFloat(result._sum.amount || 0);
    const limit = parseFloat(policy.maxDailyAllAgents);
    if (spent + parseFloat(amount) > limit) {
      return {
        passed: false,
        reason: `Daily cross-agent spend limit exceeded ($${spent.toFixed(2)} spent, $${limit} global limit)`,
      };
    }
    return { passed: true, check: 'daily_global_limit', spent, limit };
  }

  async _checkCounterpartyTrust(policy, targetId) {
    const minScore = parseFloat(policy.minCounterpartyTrustScore || 0);
    if (minScore <= 0) return { passed: true, check: 'counterparty_trust' };

    // Trust score: ratio of successful transactions as a target
    const totalAsTgt = await prisma.crossAgentTransaction.count({ where: { targetAgentId: targetId } });
    const successAsTgt = await prisma.crossAgentTransaction.count({
      where: { targetAgentId: targetId, settlementStatus: 'settled' },
    });
    const score = totalAsTgt > 0 ? successAsTgt / totalAsTgt : 0;

    if (score < minScore) {
      return { passed: false, reason: `Counterparty trust score ${score.toFixed(2)} below required ${minScore}` };
    }
    return { passed: true, check: 'counterparty_trust', score };
  }

  async _recordTransaction({
    sourceAgentId, targetAgentId, amount, paymentType, description,
    policyId = null, authorized, authorizationMethod, settlementMode = null,
    requiresHuman = false, metadata = {},
  }) {
    return prisma.crossAgentTransaction.create({
      data: {
        sourceAgentId,
        targetAgentId,
        amount,
        paymentType,
        description,
        policyId,
        authorized,
        authorizationMethod,
        settlementStatus: authorized ? (settlementMode === 'immediate' ? 'settled' : 'pending') : 'failed',
        settlementRail: metadata.rail || 'internal',
        requiresHuman,
        metadata,
      },
    });
  }
}

module.exports = new CrossAgentGovernor();
module.exports.CrossAgentGovernor = CrossAgentGovernor;
