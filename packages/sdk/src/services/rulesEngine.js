const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Rules Engine v2
 * Evaluates spend rules for a wallet before allowing transactions
 * Now with kill switch support and audit logging
 */

class RulesEngine {
  
  /**
   * Evaluate all active rules for a transaction
   * Returns { approved: boolean, results: [], requiresApproval: boolean, killSwitched: boolean }
   */
  async evaluateTransaction(walletId, transaction) {
    const { amount, category, recipientId, metadata = {} } = transaction;
    
    // First, check kill switch status
    const killSwitchStatus = await this.checkKillSwitch(walletId);
    if (killSwitchStatus.triggered) {
      return {
        approved: false,
        killSwitched: true,
        requiresApproval: false,
        results: [{
          ruleId: killSwitchStatus.killSwitchId,
          ruleType: 'KILL_SWITCH',
          passed: false,
          reason: killSwitchStatus.reason,
          details: killSwitchStatus
        }],
        evaluatedAt: new Date().toISOString()
      };
    }
    
    // Get all active rules for this wallet, ordered by priority
    const rules = await prisma.spendRule.findMany({
      where: { walletId, active: true },
      orderBy: { priority: 'desc' }
    });

    const results = [];
    let approved = true;
    let requiresApproval = false;

    for (const rule of rules) {
      const result = await this.evaluateRule(rule, walletId, transaction);
      results.push({
        ruleId: rule.id,
        ruleType: rule.ruleType,
        passed: result.passed,
        reason: result.reason,
        details: result.details
      });

      if (!result.passed) {
        approved = false;
      }

      if (result.requiresApproval) {
        requiresApproval = true;
      }
    }

    const evaluation = {
      approved,
      requiresApproval,
      killSwitched: false,
      results,
      evaluatedAt: new Date().toISOString()
    };

    return evaluation;
  }

  /**
   * Check if kill switch is triggered for a wallet
   */
  async checkKillSwitch(walletId) {
    // Get active kill switches
    const killSwitches = await prisma.killSwitch.findMany({
      where: { walletId, active: true }
    });

    if (killSwitches.length === 0) {
      return { triggered: false };
    }

    for (const ks of killSwitches) {
      // If already triggered and not reset, block
      if (ks.triggered && !ks.resetAt) {
        return {
          triggered: true,
          killSwitchId: ks.id,
          triggerType: ks.triggerType,
          reason: `Kill switch triggered at ${ks.triggeredAt}`,
          triggeredAt: ks.triggeredAt,
          threshold: ks.threshold
        };
      }

      // Check if should trigger now
      const shouldTrigger = await this.evaluateKillSwitchCondition(ks, walletId);
      
      if (shouldTrigger.trigger) {
        // Update kill switch to triggered
        await prisma.killSwitch.update({
          where: { id: ks.id },
          data: {
            triggered: true,
            triggeredAt: new Date(),
            currentValue: shouldTrigger.currentValue
          }
        });

        // Freeze the wallet
        await prisma.wallet.update({
          where: { id: walletId },
          data: { status: 'KILL_SWITCHED' }
        });

        // Log the event
        const wallet = await prisma.wallet.findUnique({
          where: { id: walletId },
          select: { agentId: true }
        });

        await this.logAudit(wallet.agentId, {
          action: 'KILL_SWITCH_TRIGGERED',
          resource: 'wallet',
          resourceId: walletId,
          decision: 'BLOCKED',
          reasoning: {
            triggerType: ks.triggerType,
            threshold: ks.threshold,
            currentValue: shouldTrigger.currentValue,
            reason: shouldTrigger.reason
          }
        });

        return {
          triggered: true,
          killSwitchId: ks.id,
          triggerType: ks.triggerType,
          reason: shouldTrigger.reason,
          triggeredAt: new Date(),
          threshold: ks.threshold,
          currentValue: shouldTrigger.currentValue
        };
      }
    }

    return { triggered: false };
  }

  /**
   * Evaluate a kill switch condition
   */
  async evaluateKillSwitchCondition(killSwitch, walletId) {
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - killSwitch.windowHours);

    switch (killSwitch.triggerType) {
      case 'DRAWDOWN_PERCENT': {
        // Calculate drawdown from peak balance
        const transactions = await prisma.transaction.findMany({
          where: {
            walletId,
            status: 'COMPLETED',
            createdAt: { gte: windowStart }
          },
          orderBy: { createdAt: 'asc' }
        });

        if (transactions.length === 0) {
          return { trigger: false };
        }

        // Get starting balance (balance + all completed transactions)
        const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
        const currentBalance = parseFloat(wallet.balance);
        
        // Calculate what peak balance was
        let runningBalance = currentBalance;
        for (const tx of [...transactions].reverse()) {
          runningBalance += parseFloat(tx.amount);
        }
        const peakBalance = runningBalance;

        const drawdown = peakBalance > 0 
          ? (peakBalance - currentBalance) / peakBalance 
          : 0;

        if (drawdown >= parseFloat(killSwitch.threshold)) {
          return {
            trigger: true,
            currentValue: drawdown,
            reason: `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds threshold ${(parseFloat(killSwitch.threshold) * 100).toFixed(1)}%`
          };
        }
        return { trigger: false, currentValue: drawdown };
      }

      case 'LOSS_AMOUNT': {
        // Sum of negative results in window
        const completedTxs = await prisma.transaction.findMany({
          where: {
            walletId,
            status: 'COMPLETED',
            createdAt: { gte: windowStart }
          }
        });

        // Calculate losses from metadata (trading results)
        let totalLoss = 0;
        for (const tx of completedTxs) {
          const pnl = tx.metadata?.pnl || 0;
          if (pnl < 0) {
            totalLoss += Math.abs(pnl);
          }
        }

        if (totalLoss >= parseFloat(killSwitch.threshold)) {
          return {
            trigger: true,
            currentValue: totalLoss,
            reason: `Losses $${totalLoss.toFixed(2)} exceed threshold $${parseFloat(killSwitch.threshold).toFixed(2)}`
          };
        }
        return { trigger: false, currentValue: totalLoss };
      }

      case 'CONSECUTIVE_LOSSES': {
        const recentTxs = await prisma.transaction.findMany({
          where: {
            walletId,
            status: 'COMPLETED',
            category: 'trading'
          },
          orderBy: { createdAt: 'desc' },
          take: parseInt(killSwitch.threshold) + 5
        });

        let consecutiveLosses = 0;
        for (const tx of recentTxs) {
          const pnl = tx.metadata?.pnl || 0;
          if (pnl < 0) {
            consecutiveLosses++;
          } else {
            break; // Streak broken
          }
        }

        if (consecutiveLosses >= parseInt(killSwitch.threshold)) {
          return {
            trigger: true,
            currentValue: consecutiveLosses,
            reason: `${consecutiveLosses} consecutive losses exceeds threshold of ${parseInt(killSwitch.threshold)}`
          };
        }
        return { trigger: false, currentValue: consecutiveLosses };
      }

      case 'DAILY_LOSS_LIMIT': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayTxs = await prisma.transaction.findMany({
          where: {
            walletId,
            status: 'COMPLETED',
            createdAt: { gte: today }
          }
        });

        let todayLoss = 0;
        for (const tx of todayTxs) {
          const pnl = tx.metadata?.pnl || 0;
          if (pnl < 0) {
            todayLoss += Math.abs(pnl);
          }
        }

        if (todayLoss >= parseFloat(killSwitch.threshold)) {
          return {
            trigger: true,
            currentValue: todayLoss,
            reason: `Daily losses $${todayLoss.toFixed(2)} exceed limit $${parseFloat(killSwitch.threshold).toFixed(2)}`
          };
        }
        return { trigger: false, currentValue: todayLoss };
      }

      default:
        return { trigger: false };
    }
  }

  /**
   * Reset a kill switch (requires owner action)
   */
  async resetKillSwitch(killSwitchId, ownerId) {
    const ks = await prisma.killSwitch.findUnique({
      where: { id: killSwitchId },
      include: { wallet: { include: { agent: true } } }
    });

    if (!ks) {
      throw new Error('Kill switch not found');
    }

    if (ks.wallet.agent.ownerId !== ownerId) {
      throw new Error('Not authorized to reset this kill switch');
    }

    // Reset the kill switch
    await prisma.killSwitch.update({
      where: { id: killSwitchId },
      data: {
        triggered: false,
        triggeredAt: null,
        resetAt: new Date(),
        currentValue: null
      }
    });

    // Reactivate the wallet
    await prisma.wallet.update({
      where: { id: ks.walletId },
      data: { status: 'ACTIVE' }
    });

    // Log the reset
    await this.logAudit(ks.wallet.agentId, {
      action: 'KILL_SWITCH_RESET',
      resource: 'kill_switch',
      resourceId: killSwitchId,
      decision: 'ALLOWED',
      reasoning: {
        resetBy: ownerId,
        walletId: ks.walletId
      }
    });

    return { success: true };
  }

  /**
   * Evaluate a single rule
   */
  async evaluateRule(rule, walletId, transaction) {
    const { amount, category, recipientId, metadata = {} } = transaction;
    const params = rule.parameters;

    switch (rule.ruleType) {
      case 'PER_TRANSACTION_LIMIT':
        return this.checkPerTransactionLimit(amount, params);

      case 'DAILY_LIMIT':
        return await this.checkDailyLimit(walletId, amount, params);

      case 'WEEKLY_LIMIT':
        return await this.checkWeeklyLimit(walletId, amount, params);

      case 'MONTHLY_LIMIT':
        return await this.checkMonthlyLimit(walletId, amount, params);

      case 'CATEGORY_WHITELIST':
        return this.checkCategoryWhitelist(category, params);

      case 'CATEGORY_BLACKLIST':
        return this.checkCategoryBlacklist(category, params);

      case 'RECIPIENT_WHITELIST':
        return this.checkRecipientWhitelist(recipientId, params);

      case 'RECIPIENT_BLACKLIST':
        return this.checkRecipientBlacklist(recipientId, params);

      case 'TIME_WINDOW':
        return this.checkTimeWindow(params);

      case 'REQUIRES_APPROVAL':
        return this.checkRequiresApproval(amount, params);

      case 'SIGNAL_FILTER':
        return this.checkSignalFilter(metadata, params);

      default:
        return { passed: true, reason: 'Unknown rule type - skipped' };
    }
  }

  // ============ RULE IMPLEMENTATIONS ============

  checkPerTransactionLimit(amount, params) {
    const limit = parseFloat(params.limit);
    const passed = amount <= limit;
    return {
      passed,
      reason: passed 
        ? `Amount $${amount} within per-transaction limit of $${limit}`
        : `Amount $${amount} exceeds per-transaction limit of $${limit}`,
      details: { amount, limit }
    };
  }

  async checkDailyLimit(walletId, amount, params) {
    const limit = parseFloat(params.limit);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpend = await this.getSpendSince(walletId, today);
    const projectedTotal = todaySpend + amount;
    const passed = projectedTotal <= limit;

    return {
      passed,
      reason: passed
        ? `Daily spend $${projectedTotal.toFixed(2)} within limit of $${limit}`
        : `Daily spend would be $${projectedTotal.toFixed(2)}, exceeds limit of $${limit}`,
      details: { todaySpend, amount, projectedTotal, limit }
    };
  }

  async checkWeeklyLimit(walletId, amount, params) {
    const limit = parseFloat(params.limit);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekSpend = await this.getSpendSince(walletId, weekStart);
    const projectedTotal = weekSpend + amount;
    const passed = projectedTotal <= limit;

    return {
      passed,
      reason: passed
        ? `Weekly spend $${projectedTotal.toFixed(2)} within limit of $${limit}`
        : `Weekly spend would be $${projectedTotal.toFixed(2)}, exceeds limit of $${limit}`,
      details: { weekSpend, amount, projectedTotal, limit }
    };
  }

  async checkMonthlyLimit(walletId, amount, params) {
    const limit = parseFloat(params.limit);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthSpend = await this.getSpendSince(walletId, monthStart);
    const projectedTotal = monthSpend + amount;
    const passed = projectedTotal <= limit;

    return {
      passed,
      reason: passed
        ? `Monthly spend $${projectedTotal.toFixed(2)} within limit of $${limit}`
        : `Monthly spend would be $${projectedTotal.toFixed(2)}, exceeds limit of $${limit}`,
      details: { monthSpend, amount, projectedTotal, limit }
    };
  }

  checkCategoryWhitelist(category, params) {
    const allowed = params.categories || [];
    const passed = !category || allowed.includes(category);
    return {
      passed,
      reason: passed
        ? `Category "${category || 'none'}" is allowed`
        : `Category "${category}" not in whitelist: ${allowed.join(', ')}`,
      details: { category, allowed }
    };
  }

  checkCategoryBlacklist(category, params) {
    const blocked = params.categories || [];
    const passed = !category || !blocked.includes(category);
    return {
      passed,
      reason: passed
        ? `Category "${category || 'none'}" is not blocked`
        : `Category "${category}" is blacklisted`,
      details: { category, blocked }
    };
  }

  checkRecipientWhitelist(recipientId, params) {
    const allowed = params.recipients || [];
    const passed = !recipientId || allowed.includes(recipientId);
    return {
      passed,
      reason: passed
        ? `Recipient is allowed`
        : `Recipient not in whitelist`,
      details: { recipientId, allowedCount: allowed.length }
    };
  }

  checkRecipientBlacklist(recipientId, params) {
    const blocked = params.recipients || [];
    const passed = !recipientId || !blocked.includes(recipientId);
    return {
      passed,
      reason: passed
        ? `Recipient is not blocked`
        : `Recipient is blacklisted`,
      details: { recipientId }
    };
  }

  checkTimeWindow(params) {
    const { startHour, endHour, timezone = 'UTC' } = params;
    const now = new Date();
    const currentHour = now.getUTCHours(); // Simplified - should use timezone
    
    const passed = currentHour >= startHour && currentHour < endHour;
    return {
      passed,
      reason: passed
        ? `Current time is within allowed window (${startHour}:00 - ${endHour}:00)`
        : `Current time is outside allowed window (${startHour}:00 - ${endHour}:00)`,
      details: { currentHour, startHour, endHour }
    };
  }

  checkRequiresApproval(amount, params) {
    const threshold = parseFloat(params.threshold);
    const requiresApproval = amount > threshold;
    return {
      passed: true, // This rule doesn't block, just flags
      requiresApproval,
      reason: requiresApproval
        ? `Amount $${amount} exceeds approval threshold of $${threshold} - flagged for review`
        : `Amount $${amount} below approval threshold`,
      details: { amount, threshold, requiresApproval }
    };
  }

  /**
   * Check signal strength filter
   * Only allows trades with certain signal qualities
   */
  checkSignalFilter(metadata, params) {
    const { allowedSignals = ['STRONG', 'MODERATE'], blockWeak = true } = params;
    const signalStrength = metadata?.signal_strength || 'UNKNOWN';

    const passed = allowedSignals.includes(signalStrength);
    
    return {
      passed,
      reason: passed
        ? `Signal strength "${signalStrength}" is allowed`
        : `Signal strength "${signalStrength}" not in allowed list: ${allowedSignals.join(', ')}`,
      details: { signalStrength, allowedSignals }
    };
  }

  // ============ HELPERS ============

  async getSpendSince(walletId, since) {
    const result = await prisma.transaction.aggregate({
      where: {
        walletId,
        status: 'COMPLETED',
        createdAt: { gte: since }
      },
      _sum: { amount: true }
    });
    return parseFloat(result._sum.amount || 0);
  }

  /**
   * Log an audit entry
   */
  async logAudit(agentId, entry) {
    try {
      await prisma.auditLog.create({
        data: {
          agentId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          decision: entry.decision,
          reasoning: entry.reasoning,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent
        }
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }
}

module.exports = new RulesEngine();
