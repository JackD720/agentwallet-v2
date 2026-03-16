/**
 * Spawn Governance Routes — AgentWallet V2, Feature 1
 * POST /api/spawn/:agentId          — Authorize spawning a child agent
 * GET  /api/spawn/:agentId/lineage  — Get full agent family tree
 * DELETE /api/spawn/:agentId/lineage — Terminate agent + descendants
 * GET  /api/spawn/:agentId/children — List direct children
 */

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireOwner } = require('../middleware/auth');
const spawnGovernor = require('../services/spawnGovernor');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/spawn/:agentId
 * Authorize spawning a child agent from a parent.
 * Child inherits governance policies with optional restrictions.
 */
router.post('/:agentId', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { childAgentId, childName, policyOverrides = {}, spawnPolicy = {} } = req.body;

  if (!childAgentId && !childName) {
    return res.status(400).json({ error: 'childAgentId or childName is required' });
  }

  // Verify parent belongs to this owner
  const parent = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: req.auth.ownerId },
  });
  if (!parent) return res.status(404).json({ error: 'Parent agent not found' });

  // If childName given without ID, create the agent first
  let resolvedChildId = childAgentId;
  if (!resolvedChildId) {
    const childAgent = await prisma.agent.create({
      data: { name: childName, ownerId: req.auth.ownerId },
    });
    resolvedChildId = childAgent.id;
  }

  const result = await spawnGovernor.authorizeSpawn(agentId, resolvedChildId, {
    ...policyOverrides,
    ...spawnPolicy,
  });

  if (!result.authorized) {
    return res.status(403).json({ error: result.reason });
  }

  res.status(201).json({
    message: 'Child agent spawned successfully',
    ...result,
  });
}));

/**
 * GET /api/spawn/:agentId/lineage
 * Returns the full agent family tree rooted at this agent's root.
 */
router.get('/:agentId/lineage', asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  // Access check
  if (req.auth.type === 'agent' && req.auth.agentId !== agentId) {
    // Agents can see their own lineage
    const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
    if (!lineage) return res.status(404).json({ error: 'No lineage found' });
    // Check if requesting agent is in this lineage
    if (lineage.rootId !== req.auth.agentId && lineage.agentId !== req.auth.agentId) {
      return res.status(403).json({ error: 'Cannot view this lineage' });
    }
  }

  const tree = await spawnGovernor.getLineage(agentId);
  if (!tree) return res.status(404).json({ error: 'No lineage found for this agent' });

  res.json({ lineage: tree });
}));

/**
 * DELETE /api/spawn/:agentId/lineage
 * Terminate an agent and all its descendants.
 */
router.delete('/:agentId/lineage', requireOwner, asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { cascade = true } = req.body;

  // Verify belongs to owner
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: req.auth.ownerId },
  });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const result = await spawnGovernor.terminateLineage(agentId, {
    cascade,
    operatorId: req.auth.ownerId,
  });

  res.json({
    message: `Agent${cascade ? ' and descendants' : ''} terminated`,
    ...result,
  });
}));

/**
 * GET /api/spawn/:agentId/children
 * List direct children of this agent.
 */
router.get('/:agentId/children', asyncHandler(async (req, res) => {
  const { agentId } = req.params;

  const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
  if (!lineage) return res.status(404).json({ error: 'No lineage found' });

  const children = await Promise.all(
    (lineage.childrenIds || []).map((id) =>
      prisma.agent.findUnique({
        where: { id },
        select: { id: true, name: true, status: true },
      })
    )
  );

  const childLineages = await Promise.all(
    (lineage.childrenIds || []).map((id) =>
      prisma.agentLineage.findUnique({ where: { agentId: id } })
    )
  );

  res.json({
    agentId,
    depth: lineage.depth,
    children: children
      .map((c, i) => ({
        ...c,
        depth: childLineages[i]?.depth,
        status: childLineages[i]?.status,
        childCount: childLineages[i]?.childrenIds?.length || 0,
      }))
      .filter(Boolean),
  });
}));

/**
 * GET /api/spawn/:agentId/spawn-history
 * Get spawn event audit log for this agent.
 */
router.get('/:agentId/spawn-history', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { limit = 20 } = req.query;

  const events = await prisma.spawnEvent.findMany({
    where: { OR: [{ parentId: agentId }, { childId: agentId }] },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
  });

  res.json({ events });
}));

module.exports = router;
