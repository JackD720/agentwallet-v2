const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Audit Log API
 * 
 * The "Black Box" for AI agents - every decision, every action, recorded and queryable.
 * This is the foundation of the governance/compliance story.
 */

/**
 * GET /api/audit/agent/:agentId
 * Get audit logs for an agent
 */
router.get('/agent/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { 
    from, 
    to, 
    action, 
    decision, 
    resource,
    limit = 100,
    cursor
  } = req.query;

  // Verify access (owner only)
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can view audit logs' });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { ownerId: true }
  });

  if (!agent || agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this agent' });
  }

  // Build query
  const where = { agentId };
  
  if (from) {
    where.timestamp = { ...where.timestamp, gte: new Date(from) };
  }
  if (to) {
    where.timestamp = { ...where.timestamp, lte: new Date(to) };
  }
  if (action) {
    where.action = action;
  }
  if (decision) {
    where.decision = decision;
  }
  if (resource) {
    where.resource = resource;
  }
  if (cursor) {
    where.id = { lt: cursor };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: parseInt(limit) + 1
  });

  const hasMore = logs.length > parseInt(limit);
  if (hasMore) logs.pop();

  res.json({
    logs,
    cursor: hasMore ? logs[logs.length - 1].id : null,
    hasMore
  });
}));

/**
 * GET /api/audit/transaction/:txId
 * Get all audit logs related to a specific transaction
 */
router.get('/transaction/:txId', asyncHandler(async (req, res) => {
  const { txId } = req.params;

  // Get transaction to verify access
  const transaction = await prisma.transaction.findUnique({
    where: { id: txId },
    include: {
      wallet: {
        include: {
          agent: { select: { ownerId: true } }
        }
      }
    }
  });

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (req.auth.type === 'owner' && 
      transaction.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this transaction' });
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      resourceId: txId,
      resource: 'transaction'
    },
    orderBy: { timestamp: 'asc' }
  });

  res.json({
    transactionId: txId,
    logs,
    timeline: logs.map(l => ({
      time: l.timestamp,
      action: l.action,
      decision: l.decision,
      summary: summarizeAuditEntry(l)
    }))
  });
}));

/**
 * GET /api/audit/summary/:agentId
 * Get summary statistics for audit logs
 */
router.get('/summary/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { days = 7 } = req.query;

  // Verify access
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can view audit summary' });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { ownerId: true, name: true }
  });

  if (!agent || agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this agent' });
  }

  const since = new Date();
  since.setDate(since.getDate() - parseInt(days));

  // Get counts by action
  const actionCounts = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      agentId,
      timestamp: { gte: since }
    },
    _count: true
  });

  // Get counts by decision
  const decisionCounts = await prisma.auditLog.groupBy({
    by: ['decision'],
    where: {
      agentId,
      timestamp: { gte: since }
    },
    _count: true
  });

  // Get daily breakdown
  const dailyLogs = await prisma.auditLog.findMany({
    where: {
      agentId,
      timestamp: { gte: since }
    },
    select: {
      timestamp: true,
      action: true,
      decision: true
    }
  });

  // Group by day
  const byDay = {};
  for (const log of dailyLogs) {
    const day = log.timestamp.toISOString().split('T')[0];
    if (!byDay[day]) {
      byDay[day] = { total: 0, blocked: 0, allowed: 0, escalated: 0 };
    }
    byDay[day].total++;
    byDay[day][log.decision.toLowerCase()]++;
  }

  // Calculate key metrics
  const totalActions = dailyLogs.length;
  const blockedActions = dailyLogs.filter(l => l.decision === 'BLOCKED').length;
  const escalatedActions = dailyLogs.filter(l => l.decision === 'ESCALATED').length;
  const killSwitchTriggers = dailyLogs.filter(l => l.action === 'KILL_SWITCH_TRIGGERED').length;

  res.json({
    agentId,
    agentName: agent.name,
    period: {
      days: parseInt(days),
      from: since.toISOString(),
      to: new Date().toISOString()
    },
    summary: {
      totalActions,
      blockedActions,
      blockRate: totalActions > 0 ? (blockedActions / totalActions * 100).toFixed(1) + '%' : '0%',
      escalatedActions,
      killSwitchTriggers
    },
    byAction: actionCounts.reduce((acc, c) => {
      acc[c.action] = c._count;
      return acc;
    }, {}),
    byDecision: decisionCounts.reduce((acc, c) => {
      acc[c.decision] = c._count;
      return acc;
    }, {}),
    byDay: Object.entries(byDay).map(([date, counts]) => ({
      date,
      ...counts
    })).sort((a, b) => a.date.localeCompare(b.date))
  });
}));

/**
 * GET /api/audit/export
 * Export audit logs in CSV or JSON format
 */
router.get('/export', asyncHandler(async (req, res) => {
  const { 
    agentId, 
    format = 'json',
    from,
    to,
    limit = 10000
  } = req.query;

  // Verify access
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can export audit logs' });
  }

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required' });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { ownerId: true, name: true }
  });

  if (!agent || agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this agent' });
  }

  const where = { agentId };
  if (from) where.timestamp = { ...where.timestamp, gte: new Date(from) };
  if (to) where.timestamp = { ...where.timestamp, lte: new Date(to) };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: parseInt(limit)
  });

  if (format === 'csv') {
    const headers = [
      'timestamp',
      'action',
      'resource',
      'resourceId',
      'decision',
      'reasoning'
    ];
    
    const csvRows = [headers.join(',')];
    
    for (const log of logs) {
      const row = [
        log.timestamp.toISOString(),
        log.action,
        log.resource,
        log.resourceId || '',
        log.decision,
        JSON.stringify(log.reasoning).replace(/"/g, '""')
      ];
      csvRows.push(row.map(v => `"${v}"`).join(','));
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 
      `attachment; filename=audit-${agentId}-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csvRows.join('\n'));
  }

  // JSON format
  res.json({
    exportedAt: new Date().toISOString(),
    agentId,
    agentName: agent.name,
    count: logs.length,
    logs
  });
}));

/**
 * GET /api/audit/compliance-report/:agentId
 * Generate a compliance report for an agent
 */
router.get('/compliance-report/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { days = 30 } = req.query;

  // Verify access
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can generate compliance reports' });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      wallets: {
        include: {
          rules: true,
          killSwitches: true
        }
      }
    }
  });

  if (!agent || agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this agent' });
  }

  const since = new Date();
  since.setDate(since.getDate() - parseInt(days));

  // Get all audit logs for period
  const logs = await prisma.auditLog.findMany({
    where: {
      agentId,
      timestamp: { gte: since }
    }
  });

  // Get all transactions for period
  const transactions = await prisma.transaction.findMany({
    where: {
      wallet: { agentId },
      createdAt: { gte: since }
    }
  });

  // Calculate compliance metrics
  const totalTransactions = transactions.length;
  const completedTransactions = transactions.filter(t => t.status === 'COMPLETED').length;
  const blockedTransactions = transactions.filter(t => t.status === 'REJECTED').length;
  const approvalRequired = transactions.filter(t => t.status === 'AWAITING_APPROVAL').length;
  const killSwitchBlocked = transactions.filter(t => t.status === 'KILL_SWITCHED').length;

  // Rule coverage
  const activeRules = agent.wallets.flatMap(w => w.rules.filter(r => r.active));
  const ruleTypes = [...new Set(activeRules.map(r => r.ruleType))];

  // Kill switch status
  const killSwitches = agent.wallets.flatMap(w => w.killSwitches);
  const triggeredKillSwitches = killSwitches.filter(ks => ks.triggered);

  const report = {
    generatedAt: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status
    },
    period: {
      days: parseInt(days),
      from: since.toISOString(),
      to: new Date().toISOString()
    },
    transactionMetrics: {
      total: totalTransactions,
      completed: completedTransactions,
      blocked: blockedTransactions,
      pendingApproval: approvalRequired,
      killSwitchBlocked,
      complianceRate: totalTransactions > 0 
        ? ((completedTransactions + blockedTransactions) / totalTransactions * 100).toFixed(1) + '%'
        : 'N/A'
    },
    riskControls: {
      totalRulesConfigured: activeRules.length,
      ruleTypesCovered: ruleTypes,
      killSwitchesConfigured: killSwitches.length,
      killSwitchesTriggered: triggeredKillSwitches.length
    },
    auditTrail: {
      totalEvents: logs.length,
      eventsByType: logs.reduce((acc, l) => {
        acc[l.action] = (acc[l.action] || 0) + 1;
        return acc;
      }, {}),
      decisionBreakdown: logs.reduce((acc, l) => {
        acc[l.decision] = (acc[l.decision] || 0) + 1;
        return acc;
      }, {})
    },
    recommendations: generateRecommendations(agent, logs, transactions)
  };

  res.json(report);
}));

// ============ HELPERS ============

function summarizeAuditEntry(log) {
  const summaries = {
    TRANSACTION_REQUESTED: `Transaction requested for $${log.reasoning?.amount || '?'}`,
    TRANSACTION_APPROVED: 'Transaction approved by rules engine',
    TRANSACTION_REJECTED: `Transaction rejected: ${log.reasoning?.failedRules?.map(r => r.ruleType).join(', ') || 'unknown'}`,
    TRANSACTION_EXECUTED: 'Transaction executed successfully',
    RULE_EVALUATED: `Rule ${log.reasoning?.ruleType || '?'} evaluated`,
    KILL_SWITCH_TRIGGERED: `Kill switch triggered: ${log.reasoning?.reason || 'threshold exceeded'}`,
    KILL_SWITCH_RESET: 'Kill switch reset by owner',
    APPROVAL_GRANTED: 'Manual approval granted',
    APPROVAL_DENIED: 'Manual approval denied'
  };

  return summaries[log.action] || log.action;
}

function generateRecommendations(agent, logs, transactions) {
  const recommendations = [];

  // Check if kill switches are configured
  const hasKillSwitch = agent.wallets.some(w => w.killSwitches.length > 0);
  if (!hasKillSwitch) {
    recommendations.push({
      priority: 'HIGH',
      type: 'RISK_CONTROL',
      message: 'No kill switch configured. Add a kill switch to automatically stop trading if losses exceed threshold.'
    });
  }

  // Check transaction approval rate
  const rejected = transactions.filter(t => t.status === 'REJECTED').length;
  if (rejected / transactions.length > 0.3) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'RULE_TUNING',
      message: `High rejection rate (${(rejected / transactions.length * 100).toFixed(0)}%). Consider reviewing rule thresholds.`
    });
  }

  // Check if spending limits are configured
  const hasSpendLimits = agent.wallets.some(w => 
    w.rules.some(r => ['DAILY_LIMIT', 'WEEKLY_LIMIT', 'MONTHLY_LIMIT'].includes(r.ruleType))
  );
  if (!hasSpendLimits) {
    recommendations.push({
      priority: 'HIGH',
      type: 'RISK_CONTROL',
      message: 'No spending limits configured. Add daily/weekly/monthly limits to control maximum exposure.'
    });
  }

  // Check for approval thresholds
  const hasApprovalThreshold = agent.wallets.some(w =>
    w.rules.some(r => r.ruleType === 'REQUIRES_APPROVAL')
  );
  if (!hasApprovalThreshold) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'GOVERNANCE',
      message: 'No approval thresholds configured. Consider requiring human approval for large transactions.'
    });
  }

  return recommendations;
}

module.exports = router;
