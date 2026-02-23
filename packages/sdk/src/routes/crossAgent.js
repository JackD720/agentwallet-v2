/**
 * Cross-Agent Policy Routes — AgentWallet V2, Feature 2
 *
 * POST   /api/cross-agent/policies          — Create a cross-agent transaction policy
 * GET    /api/cross-agent/policies          — List policies for owner
 * PATCH  /api/cross-agent/policies/:id      — Update a policy
 * DELETE /api/cross-agent/policies/:id      — Disable a policy
 *
 * POST   /api/cross-agent/authorize         — Pre-authorize a cross-agent tx (dry run)
 * POST   /api/cross-agent/transactions/:id/approve — Human-approve an escalated tx
 * GET    /api/cross-agent/transactions      — Transaction history
 *
 * POST   /api/cross-agent/groups            — Create an agent group
 * GET    /api/cross-agent/groups            — List agent groups
 */

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireOwner } = require('../middleware/auth');
const crossAgentGov = require('../services/crossAgentGovernor');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────
// POLICIES
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/cross-agent/policies
 * Create a new cross-agent transaction policy.
 */
router.post('/policies', requireOwner, asyncHandler(async (req, res) => {
  const {
    sourceAgentId,
    targetAgentId,
    targetAgentGroup,
    maxPerTransaction,
    maxDailyToTarget,
    maxDailyAllAgents,
    requireHumanApprovalAbove,
    allowedPaymentTypes,
    requireMutualPolicy,
    settlementMode,
    minCounterpartyTrustScore,
  } = req.body;

  if (!sourceAgentId) {
    return res.status(400).json({ error: 'sourceAgentId is required' });
  }

  // Verify source agent belongs to owner
  const agent = await prisma.agent.findFirst({
    where: { id: sourceAgentId, ownerId: req.auth.ownerId },
  });
  if (!agent) return res.status(404).json({ error: 'Source agent not found' });

  const policy = await crossAgentGov.createPolicy(req.auth.ownerId, {
    sourceAgentId,
    targetAgentId,
    targetAgentGroup,
    maxPerTransaction,
    maxDailyToTarget,
    maxDailyAllAgents,
    requireHumanApprovalAbove,
    allowedPaymentTypes,
    requireMutualPolicy,
    settlementMode,
    minCounterpartyTrustScore,
  });

  res.status(201).json({
    message: 'Cross-agent policy created',
    policy,
    description: describeCrossAgentPolicy(policy),
  });
}));

/**
 * GET /api/cross-agent/policies
 * List all cross-agent policies for this owner.
 */
router.get('/policies', requireOwner, asyncHandler(async (req, res) => {
  const { sourceAgentId } = req.query;
  const policies = await crossAgentGov.listPolicies(req.auth.ownerId, sourceAgentId || null);

  res.json({
    policies: policies.map((p) => ({ ...p, description: describeCrossAgentPolicy(p) })),
    count: policies.length,
  });
}));

/**
 * PATCH /api/cross-agent/policies/:id
 * Update a cross-agent policy.
 */
router.patch('/policies/:id', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  delete updates.ownerId; // can't change owner
  delete updates.sourceAgentId;

  const result = await crossAgentGov.updatePolicy(id, req.auth.ownerId, updates);
  if (result.count === 0) return res.status(404).json({ error: 'Policy not found' });

  const updated = await prisma.crossAgentPolicy.findUnique({ where: { id } });
  res.json({ message: 'Policy updated', policy: updated });
}));

/**
 * DELETE /api/cross-agent/policies/:id
 * Disable a policy (soft delete).
 */
router.delete('/policies/:id', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await crossAgentGov.deletePolicy(id, req.auth.ownerId);
  if (result.count === 0) return res.status(404).json({ error: 'Policy not found' });
  res.json({ message: 'Policy disabled', policyId: id });
}));

// ──────────────────────────────────────────────────────────────
// TRANSACTION AUTHORIZATION
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/cross-agent/authorize
 * Pre-authorize or execute a cross-agent transaction.
 * Set dry_run: true to just evaluate without recording.
 */
router.post('/authorize', asyncHandler(async (req, res) => {
  const {
    sourceAgentId,
    targetAgentId,
    amount,
    paymentType,
    description,
    metadata,
    dryRun = false,
  } = req.body;

  if (!sourceAgentId || !targetAgentId || amount === undefined || !paymentType) {
    return res.status(400).json({
      error: 'sourceAgentId, targetAgentId, amount, and paymentType are required',
    });
  }

  // Access check: agent can only authorize as itself; owner can do any
  if (req.auth.type === 'agent' && req.auth.agentId !== sourceAgentId) {
    return res.status(403).json({ error: 'Agents can only authorize their own transactions' });
  }

  const result = await crossAgentGov.authorizeTransaction({
    sourceAgentId,
    targetAgentId,
    amount: parseFloat(amount),
    paymentType,
    description,
    metadata,
  });

  res.json({
    ...result,
    dryRun,
    // If dry run, the transaction was not yet committed — note this
    ...(dryRun && { note: 'Dry run — no transaction recorded' }),
  });
}));

/**
 * POST /api/cross-agent/transactions/:id/approve
 * Human owner approves a held/escalated cross-agent transaction.
 */
router.post('/transactions/:id/approve', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await crossAgentGov.approveTransaction(id, req.auth.ownerId);
  if (!result.success) return res.status(400).json({ error: result.reason });

  res.json({ message: 'Transaction approved', transactionId: id });
}));

/**
 * GET /api/cross-agent/transactions
 * Get cross-agent transaction history for an agent.
 */
router.get('/transactions', asyncHandler(async (req, res) => {
  const { agentId, limit = 50, since } = req.query;

  if (!agentId) return res.status(400).json({ error: 'agentId query param is required' });

  // Access check
  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    return res.status(403).json({ error: 'Cannot view another agent\'s transactions' });
  }

  const txs = await crossAgentGov.getTransactionHistory(agentId, {
    limit: parseInt(limit),
    since,
  });

  const pending = txs.filter((t) => t.requiresHuman && !t.authorized);

  res.json({
    transactions: txs,
    pendingApproval: pending.length,
    count: txs.length,
  });
}));

// ──────────────────────────────────────────────────────────────
// AGENT GROUPS
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/cross-agent/groups
 * Create a named group of agents for policy targeting.
 */
router.post('/groups', requireOwner, asyncHandler(async (req, res) => {
  const { name, agentIds = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const group = await prisma.agentGroup.create({
    data: { ownerId: req.auth.ownerId, name, agentIds },
  });

  res.status(201).json({ message: 'Agent group created', group });
}));

/**
 * GET /api/cross-agent/groups
 */
router.get('/groups', requireOwner, asyncHandler(async (req, res) => {
  const groups = await prisma.agentGroup.findMany({
    where: { ownerId: req.auth.ownerId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ groups });
}));

/**
 * PATCH /api/cross-agent/groups/:id
 * Add/remove agents from a group.
 */
router.patch('/groups/:id', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { addAgentIds = [], removeAgentIds = [] } = req.body;

  const group = await prisma.agentGroup.findFirst({ where: { id, ownerId: req.auth.ownerId } });
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const updated = [...group.agentIds.filter((a) => !removeAgentIds.includes(a)), ...addAgentIds];
  const result = await prisma.agentGroup.update({ where: { id }, data: { agentIds: [...new Set(updated)] } });

  res.json({ message: 'Group updated', group: result });
}));

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function describeCrossAgentPolicy(p) {
  const target = p.targetAgentId
    ? `agent ${p.targetAgentId}`
    : p.targetAgentGroup
    ? `group '${p.targetAgentGroup}'`
    : 'any agent';

  return (
    `Agent ${p.sourceAgentId} → ${target}: ` +
    `max $${p.maxPerTransaction}/tx, ` +
    `$${p.maxDailyToTarget}/day to target, ` +
    `$${p.maxDailyAllAgents}/day total. ` +
    `Settlement: ${p.settlementMode}. ` +
    `Human approval above $${p.requireHumanApprovalAbove}.`
  );
}

module.exports = router;
