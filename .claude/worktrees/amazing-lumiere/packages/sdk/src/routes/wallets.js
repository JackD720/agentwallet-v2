const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { canAccessAgent } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/wallets
 * Create a wallet for an agent
 */
router.post('/', asyncHandler(async (req, res) => {
  const { agentId, currency = 'USD' } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required' });
  }

  // Check access to this agent
  const hasAccess = await canAccessAgent(req, agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot create wallet for this agent' });
  }

  const wallet = await prisma.wallet.create({
    data: {
      agentId,
      currency,
      balance: 0
    }
  });

  res.status(201).json({
    message: 'Wallet created',
    wallet: {
      id: wallet.id,
      agentId: wallet.agentId,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      createdAt: wallet.createdAt
    }
  });
}));

/**
 * GET /api/wallets/:id
 * Get wallet details including rules summary
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, ownerId: true } },
      rules: {
        where: { active: true },
        select: { id: true, ruleType: true, parameters: true }
      },
      _count: { select: { transactions: true } }
    }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  // Check access
  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  res.json({
    wallet: {
      id: wallet.id,
      agentId: wallet.agentId,
      agentName: wallet.agent.name,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      activeRules: wallet.rules,
      transactionCount: wallet._count.transactions,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    }
  });
}));

/**
 * GET /api/wallets/:id/balance
 * Quick balance check
 */
router.get('/:id/balance', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    select: { 
      id: true, 
      balance: true, 
      currency: true, 
      agentId: true,
      status: true
    }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  res.json({
    walletId: wallet.id,
    balance: wallet.balance,
    currency: wallet.currency,
    status: wallet.status
  });
}));

/**
 * POST /api/wallets/:id/deposit
 * Add funds to wallet (simulated - in production this would connect to Stripe/bank)
 */
router.post('/:id/deposit', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, source = 'manual' } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount is required' });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    select: { id: true, agentId: true, balance: true, status: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  if (wallet.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Cannot deposit to non-active wallet' });
  }

  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  // Update balance
  const updated = await prisma.wallet.update({
    where: { id },
    data: { 
      balance: { increment: amount }
    }
  });

  // Log as a transaction
  await prisma.transaction.create({
    data: {
      walletId: id,
      amount,
      description: `Deposit from ${source}`,
      category: 'deposit',
      status: 'COMPLETED',
      completedAt: new Date(),
      metadata: { source, type: 'deposit' }
    }
  });

  res.json({
    message: 'Deposit successful',
    walletId: id,
    deposited: amount,
    newBalance: updated.balance
  });
}));

/**
 * POST /api/wallets/:id/freeze
 * Freeze a wallet (no transactions allowed)
 */
router.post('/:id/freeze', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    select: { agentId: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  // Only owner can freeze
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can freeze wallets' });
  }

  await prisma.wallet.update({
    where: { id },
    data: { status: 'FROZEN' }
  });

  res.json({ message: 'Wallet frozen', walletId: id });
}));

/**
 * POST /api/wallets/:id/unfreeze
 * Unfreeze a wallet
 */
router.post('/:id/unfreeze', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can unfreeze wallets' });
  }

  const wallet = await prisma.wallet.findUnique({ where: { id } });
  
  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  await prisma.wallet.update({
    where: { id },
    data: { status: 'ACTIVE' }
  });

  res.json({ message: 'Wallet unfrozen', walletId: id });
}));

/**
 * GET /api/wallets/:id/transactions
 * Get transaction history for a wallet
 */
router.get('/:id/transactions', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, status } = req.query;

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    select: { agentId: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  const transactions = await prisma.transaction.findMany({
    where: { 
      walletId: id,
      ...(status && { status })
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset)
  });

  const total = await prisma.transaction.count({
    where: { walletId: id }
  });

  res.json({
    transactions,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}));

module.exports = router;
