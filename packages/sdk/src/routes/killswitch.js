const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const rulesEngine = require('../services/rulesEngine');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Kill Switch API
 * 
 * Configure and manage automatic trading stops.
 * The kill switch is your "circuit breaker" for when things go wrong.
 */

// Valid kill switch trigger types
const VALID_TRIGGER_TYPES = [
  'DRAWDOWN_PERCENT',   // Stop if down X% from peak
  'LOSS_AMOUNT',        // Stop if lost more than $X
  'CONSECUTIVE_LOSSES', // Stop after N consecutive losses
  'DAILY_LOSS_LIMIT'    // Stop if daily losses exceed X
];

/**
 * POST /api/killswitch
 * Create a new kill switch for a wallet
 */
router.post('/', asyncHandler(async (req, res) => {
  const { 
    walletId, 
    triggerType, 
    threshold,
    windowHours = 24 
  } = req.body;

  // Validate
  if (!walletId || !triggerType || threshold === undefined) {
    return res.status(400).json({ 
      error: 'walletId, triggerType, and threshold are required' 
    });
  }

  if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
    return res.status(400).json({ 
      error: 'Invalid triggerType',
      validTypes: VALID_TRIGGER_TYPES
    });
  }

  // Check access (owner only)
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can create kill switches' });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true }
  });

  if (!wallet || wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  // Validate threshold based on type
  const thresholdNum = parseFloat(threshold);
  if (triggerType === 'DRAWDOWN_PERCENT' && (thresholdNum <= 0 || thresholdNum > 1)) {
    return res.status(400).json({ 
      error: 'DRAWDOWN_PERCENT threshold must be between 0 and 1 (e.g., 0.2 for 20%)' 
    });
  }
  if (['LOSS_AMOUNT', 'DAILY_LOSS_LIMIT'].includes(triggerType) && thresholdNum <= 0) {
    return res.status(400).json({ 
      error: 'Loss threshold must be a positive number' 
    });
  }
  if (triggerType === 'CONSECUTIVE_LOSSES' && (thresholdNum < 1 || !Number.isInteger(thresholdNum))) {
    return res.status(400).json({ 
      error: 'CONSECUTIVE_LOSSES threshold must be a positive integer' 
    });
  }

  const killSwitch = await prisma.killSwitch.create({
    data: {
      walletId,
      triggerType,
      threshold: thresholdNum,
      windowHours: parseInt(windowHours)
    }
  });

  // Log creation
  await rulesEngine.logAudit(wallet.agentId, {
    action: 'RULE_CREATED',
    resource: 'kill_switch',
    resourceId: killSwitch.id,
    decision: 'SYSTEM',
    reasoning: {
      triggerType,
      threshold: thresholdNum,
      windowHours,
      walletId
    }
  });

  res.status(201).json({
    message: 'Kill switch created',
    killSwitch,
    description: describeKillSwitch(killSwitch)
  });
}));

/**
 * GET /api/killswitch/wallet/:walletId
 * List kill switches for a wallet
 */
router.get('/wallet/:walletId', asyncHandler(async (req, res) => {
  const { walletId } = req.params;

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  // Check access
  if (req.auth.type === 'owner' && wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  const killSwitches = await prisma.killSwitch.findMany({
    where: { walletId },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    walletId,
    walletStatus: wallet.status,
    killSwitches: killSwitches.map(ks => ({
      ...ks,
      description: describeKillSwitch(ks)
    }))
  });
}));

/**
 * GET /api/killswitch/:id
 * Get a specific kill switch
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const killSwitch = await prisma.killSwitch.findUnique({
    where: { id },
    include: {
      wallet: {
        include: { agent: true }
      }
    }
  });

  if (!killSwitch) {
    return res.status(404).json({ error: 'Kill switch not found' });
  }

  // Check access
  if (req.auth.type === 'owner' && 
      killSwitch.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this kill switch' });
  }

  res.json({
    killSwitch,
    description: describeKillSwitch(killSwitch)
  });
}));

/**
 * POST /api/killswitch/:id/reset
 * Reset a triggered kill switch and reactivate trading
 */
router.post('/:id/reset', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can reset kill switches' });
  }

  const killSwitch = await prisma.killSwitch.findUnique({
    where: { id },
    include: {
      wallet: {
        include: { agent: true }
      }
    }
  });

  if (!killSwitch) {
    return res.status(404).json({ error: 'Kill switch not found' });
  }

  if (killSwitch.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot reset this kill switch' });
  }

  if (!killSwitch.triggered) {
    return res.status(400).json({ 
      error: 'Kill switch is not triggered',
      currentStatus: 'active'
    });
  }

  // Reset via rules engine (handles wallet reactivation and logging)
  await rulesEngine.resetKillSwitch(id, req.auth.ownerId);

  const updated = await prisma.killSwitch.findUnique({ where: { id } });

  res.json({
    message: 'Kill switch reset successfully',
    killSwitch: updated,
    walletStatus: 'ACTIVE'
  });
}));

/**
 * PATCH /api/killswitch/:id
 * Update kill switch parameters
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { threshold, windowHours, active } = req.body;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can modify kill switches' });
  }

  const killSwitch = await prisma.killSwitch.findUnique({
    where: { id },
    include: {
      wallet: {
        include: { agent: true }
      }
    }
  });

  if (!killSwitch) {
    return res.status(404).json({ error: 'Kill switch not found' });
  }

  if (killSwitch.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot modify this kill switch' });
  }

  const updateData = {};
  if (threshold !== undefined) updateData.threshold = parseFloat(threshold);
  if (windowHours !== undefined) updateData.windowHours = parseInt(windowHours);
  if (active !== undefined) updateData.active = active;

  const updated = await prisma.killSwitch.update({
    where: { id },
    data: updateData
  });

  // Log the update
  await rulesEngine.logAudit(killSwitch.wallet.agentId, {
    action: 'RULE_UPDATED',
    resource: 'kill_switch',
    resourceId: id,
    decision: 'SYSTEM',
    reasoning: {
      changes: updateData,
      previousValues: {
        threshold: killSwitch.threshold,
        windowHours: killSwitch.windowHours,
        active: killSwitch.active
      }
    }
  });

  res.json({
    message: 'Kill switch updated',
    killSwitch: updated,
    description: describeKillSwitch(updated)
  });
}));

/**
 * DELETE /api/killswitch/:id
 * Delete a kill switch
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can delete kill switches' });
  }

  const killSwitch = await prisma.killSwitch.findUnique({
    where: { id },
    include: {
      wallet: {
        include: { agent: true }
      }
    }
  });

  if (!killSwitch) {
    return res.status(404).json({ error: 'Kill switch not found' });
  }

  if (killSwitch.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot delete this kill switch' });
  }

  await prisma.killSwitch.delete({ where: { id } });

  // Log deletion
  await rulesEngine.logAudit(killSwitch.wallet.agentId, {
    action: 'RULE_DELETED',
    resource: 'kill_switch',
    resourceId: id,
    decision: 'SYSTEM',
    reasoning: {
      deletedKillSwitch: {
        triggerType: killSwitch.triggerType,
        threshold: killSwitch.threshold
      }
    }
  });

  res.json({ 
    message: 'Kill switch deleted',
    killSwitchId: id
  });
}));

/**
 * POST /api/killswitch/emergency/:walletId
 * Manually trigger kill switch (emergency stop)
 */
router.post('/emergency/:walletId', asyncHandler(async (req, res) => {
  const { walletId } = req.params;
  const { reason } = req.body;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can trigger emergency stop' });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true }
  });

  if (!wallet || wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  // Freeze the wallet
  await prisma.wallet.update({
    where: { id: walletId },
    data: { status: 'KILL_SWITCHED' }
  });

  // Pause the agent
  await prisma.agent.update({
    where: { id: wallet.agentId },
    data: { status: 'KILLED' }
  });

  // Log the emergency stop
  await rulesEngine.logAudit(wallet.agentId, {
    action: 'KILL_SWITCH_TRIGGERED',
    resource: 'wallet',
    resourceId: walletId,
    decision: 'BLOCKED',
    reasoning: {
      triggerType: 'MANUAL_EMERGENCY',
      reason: reason || 'Manual emergency stop by owner',
      triggeredBy: req.auth.ownerId
    }
  });

  res.json({
    message: 'Emergency stop activated',
    walletId,
    walletStatus: 'KILL_SWITCHED',
    agentStatus: 'KILLED',
    reason: reason || 'Manual emergency stop'
  });
}));

/**
 * GET /api/killswitch/status/:agentId
 * Get overall kill switch status for an agent
 */
router.get('/status/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      wallets: {
        include: {
          killSwitches: true
        }
      }
    }
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Check access
  if (req.auth.type === 'owner' && agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot access this agent' });
  }

  const allKillSwitches = agent.wallets.flatMap(w => w.killSwitches);
  const triggered = allKillSwitches.filter(ks => ks.triggered);

  res.json({
    agentId,
    agentStatus: agent.status,
    overview: {
      totalKillSwitches: allKillSwitches.length,
      activeKillSwitches: allKillSwitches.filter(ks => ks.active).length,
      triggeredKillSwitches: triggered.length,
      tradingAllowed: agent.status === 'ACTIVE' && triggered.length === 0
    },
    wallets: agent.wallets.map(w => ({
      walletId: w.id,
      status: w.status,
      killSwitches: w.killSwitches.map(ks => ({
        id: ks.id,
        triggerType: ks.triggerType,
        threshold: ks.threshold,
        triggered: ks.triggered,
        triggeredAt: ks.triggeredAt,
        active: ks.active,
        description: describeKillSwitch(ks)
      }))
    })),
    triggeredDetails: triggered.map(ks => ({
      killSwitchId: ks.id,
      walletId: ks.walletId,
      triggerType: ks.triggerType,
      triggeredAt: ks.triggeredAt,
      currentValue: ks.currentValue,
      threshold: ks.threshold
    }))
  });
}));

/**
 * GET /api/killswitch/templates
 * Get predefined kill switch templates
 */
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      {
        name: 'conservative',
        description: 'Tight controls for new agents',
        killSwitches: [
          { triggerType: 'DRAWDOWN_PERCENT', threshold: 0.10, windowHours: 24 },
          { triggerType: 'DAILY_LOSS_LIMIT', threshold: 25, windowHours: 24 },
          { triggerType: 'CONSECUTIVE_LOSSES', threshold: 3, windowHours: 24 }
        ]
      },
      {
        name: 'standard',
        description: 'Balanced protection',
        killSwitches: [
          { triggerType: 'DRAWDOWN_PERCENT', threshold: 0.20, windowHours: 24 },
          { triggerType: 'DAILY_LOSS_LIMIT', threshold: 50, windowHours: 24 }
        ]
      },
      {
        name: 'aggressive',
        description: 'More autonomy, wider thresholds',
        killSwitches: [
          { triggerType: 'DRAWDOWN_PERCENT', threshold: 0.30, windowHours: 48 },
          { triggerType: 'DAILY_LOSS_LIMIT', threshold: 100, windowHours: 24 }
        ]
      }
    ]
  });
});

// ============ HELPERS ============

function describeKillSwitch(ks) {
  const descriptions = {
    DRAWDOWN_PERCENT: `Stop trading if account drops ${(parseFloat(ks.threshold) * 100).toFixed(0)}% from peak within ${ks.windowHours}h`,
    LOSS_AMOUNT: `Stop trading if losses exceed $${parseFloat(ks.threshold).toFixed(2)} within ${ks.windowHours}h`,
    CONSECUTIVE_LOSSES: `Stop trading after ${parseInt(ks.threshold)} consecutive losing trades`,
    DAILY_LOSS_LIMIT: `Stop trading if daily losses exceed $${parseFloat(ks.threshold).toFixed(2)}`
  };

  let desc = descriptions[ks.triggerType] || ks.triggerType;
  
  if (ks.triggered) {
    desc += ` [TRIGGERED at ${ks.triggeredAt}]`;
  }
  
  return desc;
}

module.exports = router;
