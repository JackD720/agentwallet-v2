const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { asyncHandler } = require('../middleware/errorHandler');
const { canAccessAgent } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Valid rule types
const VALID_RULE_TYPES = [
  'DAILY_LIMIT',
  'PER_TRANSACTION_LIMIT',
  'WEEKLY_LIMIT',
  'MONTHLY_LIMIT',
  'CATEGORY_WHITELIST',
  'CATEGORY_BLACKLIST',
  'RECIPIENT_WHITELIST',
  'RECIPIENT_BLACKLIST',
  'TIME_WINDOW',
  'REQUIRES_APPROVAL'
];

/**
 * POST /api/rules
 * Add a spend rule to a wallet
 */
router.post('/', asyncHandler(async (req, res) => {
  const { walletId, ruleType, parameters, priority = 0 } = req.body;

  // Validate required fields
  if (!walletId || !ruleType || !parameters) {
    return res.status(400).json({ 
      error: 'walletId, ruleType, and parameters are required' 
    });
  }

  // Validate rule type
  if (!VALID_RULE_TYPES.includes(ruleType)) {
    return res.status(400).json({ 
      error: 'Invalid ruleType',
      validTypes: VALID_RULE_TYPES
    });
  }

  // Get wallet and check access
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { agentId: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot add rules to this wallet' });
  }

  // Validate parameters based on rule type
  const paramValidation = validateRuleParameters(ruleType, parameters);
  if (!paramValidation.valid) {
    return res.status(400).json({ 
      error: 'Invalid parameters for rule type',
      details: paramValidation.error
    });
  }

  const rule = await prisma.spendRule.create({
    data: {
      walletId,
      ruleType,
      parameters,
      priority
    }
  });

  res.status(201).json({
    message: 'Rule created',
    rule
  });
}));

/**
 * GET /api/rules/wallet/:walletId
 * List all rules for a wallet
 */
router.get('/wallet/:walletId', asyncHandler(async (req, res) => {
  const { walletId } = req.params;
  const { active } = req.query;

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { agentId: true }
  });

  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const hasAccess = await canAccessAgent(req, wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this wallet' });
  }

  const rules = await prisma.spendRule.findMany({
    where: { 
      walletId,
      ...(active !== undefined && { active: active === 'true' })
    },
    orderBy: { priority: 'desc' }
  });

  res.json({ rules });
}));

/**
 * GET /api/rules/:id
 * Get a specific rule
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rule = await prisma.spendRule.findUnique({
    where: { id },
    include: {
      wallet: { select: { agentId: true } }
    }
  });

  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const hasAccess = await canAccessAgent(req, rule.wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot access this rule' });
  }

  res.json({ rule });
}));

/**
 * PATCH /api/rules/:id
 * Update a rule
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { parameters, active, priority } = req.body;

  const rule = await prisma.spendRule.findUnique({
    where: { id },
    include: { wallet: { select: { agentId: true } } }
  });

  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const hasAccess = await canAccessAgent(req, rule.wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot modify this rule' });
  }

  // Validate parameters if being updated
  if (parameters) {
    const paramValidation = validateRuleParameters(rule.ruleType, parameters);
    if (!paramValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid parameters',
        details: paramValidation.error
      });
    }
  }

  const updated = await prisma.spendRule.update({
    where: { id },
    data: {
      ...(parameters && { parameters }),
      ...(active !== undefined && { active }),
      ...(priority !== undefined && { priority })
    }
  });

  res.json({ 
    message: 'Rule updated',
    rule: updated 
  });
}));

/**
 * DELETE /api/rules/:id
 * Delete a rule
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rule = await prisma.spendRule.findUnique({
    where: { id },
    include: { wallet: { select: { agentId: true } } }
  });

  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const hasAccess = await canAccessAgent(req, rule.wallet.agentId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Cannot delete this rule' });
  }

  await prisma.spendRule.delete({ where: { id } });

  res.json({ message: 'Rule deleted', ruleId: id });
}));

/**
 * GET /api/rules/types
 * Get all valid rule types with descriptions
 */
router.get('/meta/types', (req, res) => {
  res.json({
    ruleTypes: [
      {
        type: 'PER_TRANSACTION_LIMIT',
        description: 'Maximum amount per single transaction',
        parameters: { limit: 'number (required)' },
        example: { limit: 100 }
      },
      {
        type: 'DAILY_LIMIT',
        description: 'Maximum total spend per day',
        parameters: { limit: 'number (required)' },
        example: { limit: 500 }
      },
      {
        type: 'WEEKLY_LIMIT',
        description: 'Maximum total spend per week',
        parameters: { limit: 'number (required)' },
        example: { limit: 2000 }
      },
      {
        type: 'MONTHLY_LIMIT',
        description: 'Maximum total spend per month',
        parameters: { limit: 'number (required)' },
        example: { limit: 5000 }
      },
      {
        type: 'CATEGORY_WHITELIST',
        description: 'Only allow transactions in specified categories',
        parameters: { categories: 'string[] (required)' },
        example: { categories: ['advertising', 'software', 'hosting'] }
      },
      {
        type: 'CATEGORY_BLACKLIST',
        description: 'Block transactions in specified categories',
        parameters: { categories: 'string[] (required)' },
        example: { categories: ['gambling', 'adult'] }
      },
      {
        type: 'RECIPIENT_WHITELIST',
        description: 'Only allow payments to specified recipients',
        parameters: { recipients: 'string[] (required)' },
        example: { recipients: ['vendor-123', 'service-456'] }
      },
      {
        type: 'RECIPIENT_BLACKLIST',
        description: 'Block payments to specified recipients',
        parameters: { recipients: 'string[] (required)' },
        example: { recipients: ['blocked-vendor'] }
      },
      {
        type: 'TIME_WINDOW',
        description: 'Only allow transactions during certain hours (UTC)',
        parameters: { startHour: 'number 0-23', endHour: 'number 0-23' },
        example: { startHour: 9, endHour: 17 }
      },
      {
        type: 'REQUIRES_APPROVAL',
        description: 'Flag transactions above threshold for human approval',
        parameters: { threshold: 'number (required)' },
        example: { threshold: 1000 }
      }
    ]
  });
});

// ============ HELPERS ============

function validateRuleParameters(ruleType, parameters) {
  switch (ruleType) {
    case 'PER_TRANSACTION_LIMIT':
    case 'DAILY_LIMIT':
    case 'WEEKLY_LIMIT':
    case 'MONTHLY_LIMIT':
      if (typeof parameters.limit !== 'number' || parameters.limit <= 0) {
        return { valid: false, error: 'limit must be a positive number' };
      }
      break;

    case 'CATEGORY_WHITELIST':
    case 'CATEGORY_BLACKLIST':
      if (!Array.isArray(parameters.categories) || parameters.categories.length === 0) {
        return { valid: false, error: 'categories must be a non-empty array' };
      }
      break;

    case 'RECIPIENT_WHITELIST':
    case 'RECIPIENT_BLACKLIST':
      if (!Array.isArray(parameters.recipients) || parameters.recipients.length === 0) {
        return { valid: false, error: 'recipients must be a non-empty array' };
      }
      break;

    case 'TIME_WINDOW':
      if (typeof parameters.startHour !== 'number' || typeof parameters.endHour !== 'number') {
        return { valid: false, error: 'startHour and endHour must be numbers' };
      }
      if (parameters.startHour < 0 || parameters.startHour > 23 || 
          parameters.endHour < 0 || parameters.endHour > 23) {
        return { valid: false, error: 'hours must be between 0 and 23' };
      }
      break;

    case 'REQUIRES_APPROVAL':
      if (typeof parameters.threshold !== 'number' || parameters.threshold <= 0) {
        return { valid: false, error: 'threshold must be a positive number' };
      }
      break;
  }

  return { valid: true };
}

module.exports = router;
