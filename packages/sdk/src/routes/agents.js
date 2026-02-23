const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/agents
 * Create a new agent (owner only)
 */
router.post('/', requireOwner, asyncHandler(async (req, res) => {
  const { name, metadata } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const agent = await prisma.agent.create({
    data: {
      name,
      ownerId: req.auth.ownerId,
      metadata
    }
  });

  res.status(201).json({
    message: 'Agent created successfully',
    agent: {
      id: agent.id,
      name: agent.name,
      apiKey: agent.apiKey, // Only shown once at creation!
      status: agent.status,
      createdAt: agent.createdAt
    },
    warning: 'Save the API key now - it will not be shown again'
  });
}));

/**
 * GET /api/agents
 * List all agents for the authenticated owner
 */
router.get('/', requireOwner, asyncHandler(async (req, res) => {
  const agents = await prisma.agent.findMany({
    where: { ownerId: req.auth.ownerId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { wallets: true } }
    }
  });

  res.json({ agents });
}));

/**
 * GET /api/agents/:id
 * Get agent details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check access
  if (req.auth.type === 'agent' && req.auth.agentId !== id) {
    return res.status(403).json({ error: 'Cannot access other agents' });
  }

  const agent = await prisma.agent.findFirst({
    where: { 
      id,
      ownerId: req.auth.ownerId 
    },
    include: {
      wallets: {
        select: {
          id: true,
          balance: true,
          currency: true,
          status: true
        }
      }
    }
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ 
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      metadata: agent.metadata,
      wallets: agent.wallets,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt
    }
  });
}));

/**
 * PATCH /api/agents/:id
 * Update agent (owner only)
 */
router.patch('/:id', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, status, metadata } = req.body;

  const agent = await prisma.agent.updateMany({
    where: { id, ownerId: req.auth.ownerId },
    data: {
      ...(name && { name }),
      ...(status && { status }),
      ...(metadata !== undefined && { metadata })
    }
  });

  if (agent.count === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const updated = await prisma.agent.findUnique({ where: { id } });
  res.json({ agent: updated });
}));

/**
 * POST /api/agents/:id/pause
 * Pause an agent (owner only)
 */
router.post('/:id/pause', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await prisma.agent.updateMany({
    where: { id, ownerId: req.auth.ownerId },
    data: { status: 'PAUSED' }
  });

  if (result.count === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ message: 'Agent paused', agentId: id });
}));

/**
 * POST /api/agents/:id/activate
 * Activate a paused agent (owner only)
 */
router.post('/:id/activate', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await prisma.agent.updateMany({
    where: { id, ownerId: req.auth.ownerId },
    data: { status: 'ACTIVE' }
  });

  if (result.count === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ message: 'Agent activated', agentId: id });
}));

/**
 * POST /api/agents/:id/rotate-key
 * Generate new API key for agent (owner only)
 */
router.post('/:id/rotate-key', requireOwner, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { v4: uuidv4 } = require('uuid');

  const newApiKey = uuidv4();

  const result = await prisma.agent.updateMany({
    where: { id, ownerId: req.auth.ownerId },
    data: { apiKey: newApiKey }
  });

  if (result.count === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ 
    message: 'API key rotated',
    agentId: id,
    newApiKey,
    warning: 'Save this key now - it will not be shown again'
  });
}));

module.exports = router;
