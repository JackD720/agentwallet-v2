const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { canAccessAgent } = require('../middleware/auth');
const rulesEngine = require('../services/rulesEngine');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/transactions
 * Request a payment - runs through rules engine
 * This is the core endpoint agents call to spend money
 */
router.post('/', asyncHandler(async (req, res) => {
  const { 
    walletId, 
    amount, 
    recipientId,
    recipientType = 'EXTERNAL',
    category,
    description,
    metadata
  } = req.body;

  // Validate required fields
  if (!walletId || !amount) {
    return res.status(400).json({ error: 'walletId and amount are required' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be positive' });
  }

  // Get wallet
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  // Check access
  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot transact from this wallet' });
  }

  // Check wallet status
  if (wallet.status !== 'ACTIVE') {
    return res.status(400).json({ 
      error: 'Wallet is not active',
      status: wallet.status
    });
  }

  // Check balance
  if (parseFloat(wallet.balance) < amount) {
    return res.status(400).json({ 
      error: 'Insufficient balance',
      available: wallet.balance,
      requested: amount
    });
  }

  // Run through rules engine
  const ruleEvaluation = await rulesEngine.evaluateTransaction(walletId, {
    amount,
    category,
    recipientId
  });

  // Determine transaction status based on rules
  let status;
  if (!ruleEvaluation.approved) {
    status = 'REJECTED';
  } else if (ruleEvaluation.requiresApproval) {
    status = 'AWAITING_APPROVAL';
  } else {
    status = 'APPROVED';
  }

  // Create transaction record
  const transaction = await prisma.transaction.create({
    data: {
      walletId,
      amount,
      recipientId,
      recipientType,
      category,
      description,
      status,
      ruleCheckResults: ruleEvaluation,
      metadata
    }
  });

  // If approved, execute immediately
  if (status === 'APPROVED') {
    await executeTransaction(transaction.id);
    
    const completed = await prisma.transaction.findUnique({
      where: { id: transaction.id }
    });

    return res.status(201).json({
      message: 'Transaction completed',
      transaction: completed,
      ruleEvaluation
    });
  }

  // If rejected, return with explanation
  if (status === 'REJECTED') {
    return res.status(400).json({
      message: 'Transaction rejected by spend rules',
      transaction,
      ruleEvaluation,
      failedRules: ruleEvaluation.results.filter(r => !r.passed)
    });
  }

  // If awaiting approval
  return res.status(202).json({
    message: 'Transaction pending approval',
    transaction,
    ruleEvaluation,
    hint: 'Use POST /api/transactions/:id/approve to approve'
  });
}));

/**
 * GET /api/transactions/:id
 * Get transaction details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      wallet: {
        select: { agentId: true, agent: { select: { name: true } } }
      }
    }
  });

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const hasAccess = await canAccessAgent(req, transaction.wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this transaction' });
  }

  res.json({ transaction });
}));

/**
 * POST /api/transactions/:id/approve
 * Manually approve a transaction awaiting approval (owner only)
 */
router.post('/:id/approve', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Only owners can approve
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can approve transactions' });
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { wallet: { select: { agentId: true, agent: true } } }
  });

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Verify ownership
  if (transaction.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot approve this transaction' });
  }

  if (transaction.status !== 'AWAITING_APPROVAL') {
    return res.status(400).json({ 
      error: 'Transaction is not awaiting approval',
      currentStatus: transaction.status
    });
  }

  // Check balance again
  const wallet = await prisma.wallet.findUnique({
    where: { id: transaction.walletId }
  });

  if (parseFloat(wallet.balance) < parseFloat(transaction.amount)) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Execute
  await executeTransaction(id);

  const completed = await prisma.transaction.findUnique({ where: { id } });

  res.json({
    message: 'Transaction approved and executed',
    transaction: completed
  });
}));

/**
 * POST /api/transactions/:id/reject
 * Manually reject a pending transaction (owner only)
 */
router.post('/:id/reject', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can reject transactions' });
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { wallet: { select: { agent: true } } }
  });

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.wallet.agent.ownerId !== req.auth.ownerId) {
    return res.status(403).json({ error: 'Cannot reject this transaction' });
  }

  if (transaction.status !== 'AWAITING_APPROVAL') {
    return res.status(400).json({ 
      error: 'Transaction is not awaiting approval',
      currentStatus: transaction.status
    });
  }

  const rejected = await prisma.transaction.update({
    where: { id },
    data: { 
      status: 'REJECTED',
      metadata: {
        ...transaction.metadata,
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
        rejectedBy: req.auth.ownerId
      }
    }
  });

  res.json({
    message: 'Transaction rejected',
    transaction: rejected
  });
}));

/**
 * GET /api/transactions/pending
 * List all transactions awaiting approval (owner only)
 */
router.get('/status/pending', asyncHandler(async (req, res) => {
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Only owner can view pending transactions' });
  }

  const pending = await prisma.transaction.findMany({
    where: {
      status: 'AWAITING_APPROVAL',
      wallet: {
        agent: { ownerId: req.auth.ownerId }
      }
    },
    include: {
      wallet: {
        select: { 
          id: true,
          agent: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  res.json({ 
    pendingCount: pending.length,
    transactions: pending 
  });
}));

// ============ HELPERS ============

/**
 * Execute an approved transaction
 * Deducts from wallet balance
 */
async function executeTransaction(transactionId) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId }
  });

  // Deduct balance
  await prisma.wallet.update({
    where: { id: transaction.walletId },
    data: { 
      balance: { decrement: parseFloat(transaction.amount) }
    }
  });

  // Update transaction status
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date()
    }
  });

  // In production: trigger actual payment via Stripe/bank API here

  return true;
}

module.exports = router;
