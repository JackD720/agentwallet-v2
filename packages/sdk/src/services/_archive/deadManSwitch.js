/**
 * DeadManSwitch — AgentWallet V2, Feature 3
 *
 * Multi-layered anomaly detection and automatic response system.
 * Monitors heartbeats, spend velocity, and anomalous behavior.
 * Escalation ladder: alert → throttle → freeze → terminate
 *
 * Upgrades over V1 kill switch:
 * - Heartbeat monitoring (background thread)
 * - Spend anomaly detection (vs historical baseline)
 * - Velocity limiting (tx/min, unique vendors/hr)
 * - Cascade freeze/terminate to children
 * - Full audit trail via DeadManSwitchEvent
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory state (survives as long as the process is running)
const _frozenAgents = new Set();
const _heartbeats = new Map(); // agentId → Date
const _txWindows = new Map();  // agentId → [timestamps]
let _monitorInterval = null;

class DeadManSwitch {
  constructor({ notificationHandler } = {}) {
    this.notify = notificationHandler || null;
  }

  // ─────────────────────────────────────────────────────────────
  // AGENT REGISTRATION & HEARTBEAT
  // ─────────────────────────────────────────────────────────────

  async registerAgent(agentId, configOverrides = {}) {
    const defaults = {
      heartbeatIntervalSeconds: 60,
      missedHeartbeatThreshold: 3,
      anomalyWindowMinutes: 60,
      anomalySpendMultiplier: 3.0,
      anomalyTxCountMultiplier: 5.0,
      maxTxPerMinute: 10,
      maxUniqueVendorsPerHour: 20,
      onAnomaly: 'alert',
      onMissedHeartbeat: 'freeze',
      onManualTrigger: 'terminate',
      cascadeToChildren: true,
      notifyParentOnTrigger: true,
      autoRecover: false,
      recoveryRequiresHuman: true,
      enabled: true,
    };

    const config = await prisma.deadManSwitchConfig.upsert({
      where: { agentId },
      update: { ...configOverrides, updatedAt: new Date() },
      create: { agentId, ...defaults, ...configOverrides },
    });

    _heartbeats.set(agentId, new Date());
    return config;
  }

  /**
   * Agent calls this periodically to prove it's alive.
   * Returns current status and any pending directives.
   */
  async heartbeat(agentId) {
    if (_frozenAgents.has(agentId)) {
      return {
        status: 'frozen',
        directive: 'cease_all_transactions',
        reason: 'Agent wallet is frozen — contact owner to unfreeze',
      };
    }

    _heartbeats.set(agentId, new Date());

    await prisma.deadManSwitchConfig.updateMany({
      where: { agentId },
      data: { lastHeartbeatAt: new Date() },
    });

    const config = await this._getConfig(agentId);
    return {
      status: 'active',
      directive: 'continue',
      nextHeartbeatDue: config
        ? new Date(Date.now() + config.heartbeatIntervalSeconds * 1000).toISOString()
        : null,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION GATE (called before every transaction)
  // ─────────────────────────────────────────────────────────────

  async evaluateTransaction(agentId, amount, vendor = null) {
    // 1. Hard stop if already frozen
    if (_frozenAgents.has(agentId)) {
      return { allow: false, reason: 'Agent is frozen' };
    }

    const config = await this._getConfig(agentId);
    if (!config || !config.enabled) {
      return { allow: true }; // no DMS config = no restrictions
    }

    const now = Date.now();

    // 2. Velocity check — tx per minute
    if (!_txWindows.has(agentId)) _txWindows.set(agentId, []);
    const window = _txWindows.get(agentId);
    const oneMinAgo = now - 60000;
    const recentCount = window.filter((t) => t > oneMinAgo).length;

    if (recentCount >= config.maxTxPerMinute) {
      await this._trigger(agentId, 'velocity', config.onAnomaly, {
        txPerMinute: recentCount,
        limit: config.maxTxPerMinute,
      }, config);
      return { allow: false, reason: `Velocity limit exceeded (${recentCount} tx/min, max ${config.maxTxPerMinute})` };
    }

    // 3. Unique vendors per hour check
    if (vendor) {
      const oneHrAgo = new Date(now - 3600000);
      const recentVendorTxs = await prisma.transaction.findMany({
        where: {
          wallet: { agentId },
          createdAt: { gte: oneHrAgo },
          description: { not: null },
        },
        select: { description: true },
      });
      const uniqueVendors = new Set(recentVendorTxs.map((t) => t.description));
      uniqueVendors.add(vendor);

      if (uniqueVendors.size > config.maxUniqueVendorsPerHour) {
        await this._trigger(agentId, 'velocity', config.onAnomaly, {
          uniqueVendors: uniqueVendors.size,
          limit: config.maxUniqueVendorsPerHour,
        }, config);
        return { allow: false, reason: 'Suspicious vendor diversity — too many unique vendors in 1 hour' };
      }
    }

    // 4. Spend anomaly check — vs historical average
    const windowMs = config.anomalyWindowMinutes * 60000;
    const windowStart = new Date(now - windowMs);

    const recentSpend = await prisma.transaction.aggregate({
      where: { wallet: { agentId }, createdAt: { gte: windowStart }, status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const currentWindowTotal = parseFloat(recentSpend._sum.amount || 0) + parseFloat(amount);

    const historicalAvg = await this._getHistoricalAverage(agentId, config.anomalyWindowMinutes);

    if (historicalAvg > 0 && currentWindowTotal > historicalAvg * parseFloat(config.anomalySpendMultiplier)) {
      await this._trigger(agentId, 'anomaly', config.onAnomaly, {
        currentWindowSpend: currentWindowTotal,
        historicalAverage: historicalAvg,
        multiplierTriggered: parseFloat(config.anomalySpendMultiplier),
      }, config);

      if (['freeze', 'terminate'].includes(config.onAnomaly)) {
        return { allow: false, reason: 'Anomalous spending detected — exceeds historical baseline' };
      }
    }

    // 5. Record transaction timestamp
    window.push(now);
    // Trim to last hour
    _txWindows.set(agentId, window.filter((t) => t > now - 3600000));

    return { allow: true };
  }

  // ─────────────────────────────────────────────────────────────
  // MANUAL CONTROLS
  // ─────────────────────────────────────────────────────────────

  async manualKill(agentId, operatorId, reason) {
    const config = await this._getConfig(agentId);
    const action = config?.onManualTrigger || 'terminate';
    await this._trigger(agentId, 'manual', action, { operator: operatorId, reason }, config);
    return { success: true, agentId, action };
  }

  async freeze(agentId, operatorId) {
    const config = await this._getConfig(agentId);
    await this._trigger(agentId, 'manual', 'freeze', { operator: operatorId }, config);
    return { success: true, agentId, status: 'frozen' };
  }

  async unfreeze(agentId, operatorId) {
    const config = await this._getConfig(agentId);
    if (config?.recoveryRequiresHuman && !operatorId) {
      return { success: false, reason: 'Human operator required to unfreeze' };
    }

    _frozenAgents.delete(agentId);

    await prisma.agent.updateMany({
      where: { id: agentId, status: { in: ['FROZEN', 'SUSPENDED'] } },
      data: { status: 'ACTIVE' },
    });

    await prisma.deadManSwitchEvent.create({
      data: {
        agentId,
        triggerType: 'manual',
        actionTaken: 'unfreeze',
        details: { operator: operatorId, recoveredAt: new Date().toISOString() },
        resolved: true,
        resolvedBy: operatorId,
        resolvedAt: new Date(),
      },
    });

    return { success: true, agentId, status: 'active' };
  }

  async getHealth(agentId) {
    const config = await this._getConfig(agentId);
    const isFrozen = _frozenAgents.has(agentId);
    const lastBeat = _heartbeats.get(agentId);
    const recentEvents = await prisma.deadManSwitchEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      agentId,
      status: isFrozen ? 'frozen' : 'active',
      lastHeartbeatAt: lastBeat?.toISOString() || config?.lastHeartbeatAt || null,
      secondsSinceHeartbeat: lastBeat ? Math.floor((Date.now() - lastBeat.getTime()) / 1000) : null,
      config: config || null,
      recentEvents,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // BACKGROUND HEARTBEAT MONITOR
  // ─────────────────────────────────────────────────────────────

  startHeartbeatMonitor(checkIntervalMs = 10000) {
    if (_monitorInterval) clearInterval(_monitorInterval);

    _monitorInterval = setInterval(async () => {
      const now = Date.now();

      for (const [agentId, lastBeat] of _heartbeats.entries()) {
        if (_frozenAgents.has(agentId)) continue;

        const config = await this._getConfig(agentId);
        if (!config || !config.enabled) continue;

        const elapsed = (now - lastBeat.getTime()) / 1000;
        const maxGap = config.heartbeatIntervalSeconds * config.missedHeartbeatThreshold;

        if (elapsed > maxGap) {
          await this._trigger(agentId, 'heartbeat', config.onMissedHeartbeat, {
            secondsSinceLastBeat: Math.floor(elapsed),
            threshold: maxGap,
          }, config);
        }
      }
    }, checkIntervalMs);

    console.log('  [DeadManSwitch] Heartbeat monitor started');
  }

  stopHeartbeatMonitor() {
    if (_monitorInterval) {
      clearInterval(_monitorInterval);
      _monitorInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  async _trigger(agentId, triggerType, action, details, config) {
    const cascadedTo = [];

    if (action === 'alert') {
      if (this.notify) await this.notify.sendAlert(agentId, triggerType, details);

    } else if (action === 'throttle') {
      // Throttle: reduce wallet daily limits by 90%
      const wallets = await prisma.wallet.findMany({ where: { agentId } });
      for (const wallet of wallets) {
        const dailyRules = await prisma.spendRule.findMany({
          where: { walletId: wallet.id, ruleType: 'DAILY_LIMIT', active: true },
        });
        for (const rule of dailyRules) {
          const current = parseFloat(rule.parameters?.limit || 1000);
          await prisma.spendRule.update({
            where: { id: rule.id },
            data: { parameters: { ...rule.parameters, limit: current * 0.1, throttled: true } },
          });
        }
      }
      if (this.notify) await this.notify.sendAlert(agentId, triggerType, details);

    } else if (action === 'freeze') {
      _frozenAgents.add(agentId);
      await prisma.agent.updateMany({ where: { id: agentId }, data: { status: 'FROZEN' } });

      // Cascade to children
      if (config?.cascadeToChildren) {
        const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
        if (lineage?.childrenIds?.length) {
          for (const childId of lineage.childrenIds) {
            _frozenAgents.add(childId);
            await prisma.agent.updateMany({ where: { id: childId }, data: { status: 'FROZEN' } });
            cascadedTo.push(childId);
          }
        }
      }

      if (this.notify) await this.notify.sendUrgentAlert(agentId, triggerType, details);

    } else if (action === 'terminate') {
      _frozenAgents.add(agentId);
      await prisma.agent.updateMany({ where: { id: agentId }, data: { status: 'TERMINATED' } });
      await prisma.agentLineage.updateMany({ where: { agentId }, data: { status: 'terminated' } });

      // Cascade terminate to children
      if (config?.cascadeToChildren) {
        const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
        if (lineage?.childrenIds?.length) {
          for (const childId of lineage.childrenIds) {
            _frozenAgents.add(childId);
            await prisma.agent.updateMany({ where: { id: childId }, data: { status: 'TERMINATED' } });
            cascadedTo.push(childId);
          }
        }
      }

      if (this.notify) await this.notify.sendCriticalAlert(agentId, triggerType, details);
    }

    // Record event
    await prisma.deadManSwitchEvent.create({
      data: {
        agentId,
        triggerType,
        actionTaken: action,
        details,
        cascadedTo,
        resolved: false,
      },
    });
  }

  async _getConfig(agentId) {
    return prisma.deadManSwitchConfig.findUnique({ where: { agentId } });
  }

  async _getHistoricalAverage(agentId, windowMinutes) {
    // Get average spend across the last 7 equivalent windows (excluding the current one)
    const windowMs = windowMinutes * 60000;
    const samples = 7;
    const totals = [];

    for (let i = 1; i <= samples; i++) {
      const end = new Date(Date.now() - windowMs * i);
      const start = new Date(Date.now() - windowMs * (i + 1));
      const result = await prisma.transaction.aggregate({
        where: { wallet: { agentId }, createdAt: { gte: start, lte: end }, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      totals.push(parseFloat(result._sum.amount || 0));
    }

    if (totals.every((t) => t === 0)) return 0;
    return totals.reduce((a, b) => a + b, 0) / totals.filter((t) => t > 0).length;
  }
}

// Export singleton (process-level state for heartbeat tracking)
const instance = new DeadManSwitch();
module.exports = instance;
module.exports.DeadManSwitch = DeadManSwitch;
