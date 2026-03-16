/**
 * Dead Man's Switch Routes — AgentWallet V2, Feature 3
 *
 * POST /api/deadman/agents/:agentId/register   — Set up DMS for an agent
 * POST /api/deadman/agents/:agentId/heartbeat  — Agent heartbeat ping
 * GET  /api/deadman/agents/:agentId/health     — Agent health + DMS status
 * POST /api/deadman/agents/:agentId/freeze     — Emergency freeze
 * POST /api/deadman/agents/:agentId/unfreeze   — Operator-approved unfreeze
 * POST /api/deadman/agents/:agentId/terminate  — Permanent termination
 * GET  /api/deadman/agents/:agentId/events     — DMS event history
 * POST /api/deadman/evaluate                   — Pre-evaluate a transaction (dry run)
 */

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireOwner } = require('../middleware/auth');
const deadManSwitch = require('../services/deadManSwitch');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/deadman/agents/:agentId/register
 * Configure the dead man's switch for an agent.
 */
router.post('/agents/:agentId/register', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  // Verify ownership
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: req.auth.ownerId },
  });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const {
    heartbeatIntervalSeconds,
    missedHeartbeatThreshold,
    anomalyWindowMinutes,
    anomalySpendMultiplier,
    anomalyTxCountMultiplier,
    maxTxPerMinute,
    maxUniqueVendorsPerHour,
    onAnomaly,
    onMissedHeartbeat,
    onManualTrigger,
    cascadeToChildren,
    autoRecover,
    recoveryRequiresHuman,
  } = req.body;

  const validActions = ['alert', 'throttle', 'freeze', 'terminate'];
  for (const field of ['onAnomaly', 'onMissedHeartbeat', 'onManualTrigger']) {
    const val = req.body[field];
    if (val && !validActions.includes(val)) {
      return res.status(400).json({ error: `${field} must be one of: ${validActions.join(', ')}` });
    }
  }

  const config = await deadManSwitch.registerAgent(agentId, {
    ...(heartbeatIntervalSeconds !== undefined && { heartbeatIntervalSeconds }),
    ...(missedHeartbeatThreshold !== undefined && { missedHeartbeatThreshold }),
    ...(anomalyWindowMinutes !== undefined && { anomalyWindowMinutes }),
    ...(anomalySpendMultiplier !== undefined && { anomalySpendMultiplier }),
    ...(anomalyTxCountMultiplier !== undefined && { anomalyTxCountMultiplier }),
    ...(maxTxPerMinute !== undefined && { maxTxPerMinute }),
    ...(maxUniqueVendorsPerHour !== undefined && { maxUniqueVendorsPerHour }),
    ...(onAnomaly && { onAnomaly }),
    ...(onMissedHeartbeat && { onMissedHeartbeat }),
    ...(onManualTrigger && { onManualTrigger }),
    ...(cascadeToChildren !== undefined && { cascadeToChildren }),
    ...(autoRecover !== undefined && { autoRecover }),
    ...(recoveryRequiresHuman !== undefined && { recoveryRequiresHuman }),
  });

  res.status(201).json({
    message: 'Dead man\'s switch configured',
    config,
    description: describeDMSConfig(config),
  });
}));

// ──────────────────────────────────────────────────────────────
// HEARTBEAT
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/deadman/agents/:agentId/heartbeat
 * Agent proves it's still alive. Returns directives.
 * This endpoint is called by the agent itself (agent auth).
 */
router.post('/agents/:agentId/heartbeat', asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  // Agent can only heartbeat for itself
  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    return res.status(403).json({ error: 'Agents can only send their own heartbeat' });
  }

  const response = await deadManSwitch.heartbeat(agentId);
  res.json(response);
}));

// ──────────────────────────────────────────────────────────────
// HEALTH & STATUS
// ──────────────────────────────────────────────────────────────

/**
 * GET /api/deadman/agents/:agentId/health
 * Get an agent's DMS health, last heartbeat, and recent events.
 */
router.get('/agents/:agentId/health', asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    return res.status(403).json({ error: 'Cannot view another agent\'s health' });
  }

  const health = await deadManSwitch.getHealth(agentId);
  if (!health.config) {
    return res.status(404).json({ error: 'No dead man\'s switch configured for this agent' });
  }

  res.json(health);
}));

/**
 * GET /api/deadman/agents/:agentId/events
 * Get recent DMS events (triggers, freezes, terminations).
 */
router.get('/agents/:agentId/events', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { limit = 50, resolved } = req.query;

  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    return res.status(403).json({ error: 'Cannot view another agent\'s events' });
  }

  const where = {
    agentId,
    ...(resolved !== undefined && { resolved: resolved === 'true' }),
  };

  const events = await prisma.deadManSwitchEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
  });

  res.json({ events, count: events.length });
}));

// ──────────────────────────────────────────────────────────────
// CONTROLS (owner only)
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/deadman/agents/:agentId/freeze
 * Emergency freeze — halts all transactions immediately.
 */
router.post('/agents/:agentId/freeze', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { reason } = req.body;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, ownerId: req.auth.ownerId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const result = await deadManSwitch.freeze(agentId, req.auth.ownerId);
  res.json({ message: 'Agent frozen', ...result, reason });
}));

/**
 * POST /api/deadman/agents/:agentId/unfreeze
 * Human-authorized recovery from frozen state.
 */
router.post('/agents/:agentId/unfreeze', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, ownerId: req.auth.ownerId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const result = await deadManSwitch.unfreeze(agentId, req.auth.ownerId);
  if (!result.success) return res.status(400).json({ error: result.reason });

  res.json({ message: 'Agent unfrozen and reactivated', ...result });
}));

/**
 * POST /api/deadman/agents/:agentId/terminate
 * Permanent manual termination. Cascades to all children.
 */
router.post('/agents/:agentId/terminate', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { reason = 'Manual termination by operator' } = req.body;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, ownerId: req.auth.ownerId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const result = await deadManSwitch.manualKill(agentId, req.auth.ownerId, reason);
  res.json({ message: 'Agent terminated', ...result, reason });
}));

/**
 * POST /api/deadman/evaluate
 * Pre-evaluate whether a transaction would be blocked by the DMS.
 * Agents call this before spending to self-check.
 */
router.post('/evaluate', asyncHandler(async (req, res) => {
  const { agentId, amount, vendor } = req.body;

  if (!agentId || amount === undefined) {
    return res.status(400).json({ error: 'agentId and amount are required' });
  }

  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    return res.status(403).json({ error: 'Can only evaluate for your own agent' });
  }

  const result = await deadManSwitch.evaluateTransaction(agentId, parseFloat(amount), vendor);
  res.json({ ...result, agentId, amount, vendor });
}));

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function describeDMSConfig(c) {
  return [
    `Heartbeat every ${c.heartbeatIntervalSeconds}s, freeze after ${c.missedHeartbeatThreshold} misses.`,
    `Anomaly detection: flag at ${c.anomalySpendMultiplier}x historical spend in ${c.anomalyWindowMinutes}min window.`,
    `Velocity: max ${c.maxTxPerMinute} tx/min.`,
    `On anomaly: ${c.onAnomaly}. On missed heartbeat: ${c.onMissedHeartbeat}. On manual: ${c.onManualTrigger}.`,
    `Cascade to children: ${c.cascadeToChildren}. Recovery requires human: ${c.recoveryRequiresHuman}.`,
  ].join(' ');
}

module.exports = router;
