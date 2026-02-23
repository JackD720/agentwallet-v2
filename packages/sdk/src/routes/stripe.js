const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const stripeService = require('../services/stripeService');

const router = express.Router();

/**
 * GET /api/stripe/status
 * Check if Stripe is configured
 */
router.get('/status', (req, res) => {
  res.json({
    configured: stripeService.isConfigured(),
    message: stripeService.isConfigured() 
      ? 'Stripe is configured and ready'
      : 'Stripe not configured. Set STRIPE_SECRET_KEY in environment.'
  });
});

/**
 * POST /api/stripe/deposit/checkout
 * Create a Stripe Checkout session for depositing funds
 * Returns a URL to redirect the user to
 */
router.post('/deposit/checkout', asyncHandler(async (req, res) => {
  const { walletId, amount, successUrl, cancelUrl } = req.body;

  if (!walletId || !amount) {
    return res.status(400).json({ error: 'walletId and amount are required' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be positive' });
  }

  try {
    const session = await stripeService.createDepositSession({
      walletId,
      amount,
      successUrl,
      cancelUrl
    });

    res.json({
      message: 'Checkout session created',
      ...session
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/stripe/deposit/intent
 * Create a Payment Intent for programmatic deposits
 * Use with Stripe Elements or mobile SDKs
 */
router.post('/deposit/intent', asyncHandler(async (req, res) => {
  const { walletId, amount, currency } = req.body;

  if (!walletId || !amount) {
    return res.status(400).json({ error: 'walletId and amount are required' });
  }

  try {
    const intent = await stripeService.createPaymentIntent({
      walletId,
      amount,
      currency
    });

    res.json({
      message: 'Payment intent created',
      ...intent
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/stripe/payout
 * Initiate a payout from wallet to bank account
 */
router.post('/payout', asyncHandler(async (req, res) => {
  const { walletId, amount, destinationAccountId } = req.body;

  if (!walletId || !amount) {
    return res.status(400).json({ error: 'walletId and amount are required' });
  }

  try {
    const transaction = await stripeService.createPayout({
      walletId,
      amount,
      destinationAccountId
    });

    res.json({
      message: 'Payout initiated',
      transaction
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * GET /api/stripe/balance
 * Get platform Stripe balance
 */
router.get('/balance', asyncHandler(async (req, res) => {
  if (req.auth.type !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }

  try {
    const balance = await stripeService.getBalance();
    
    if (!balance) {
      return res.json({ 
        configured: false,
        message: 'Stripe not configured' 
      });
    }

    res.json({
      configured: true,
      available: balance.available,
      pending: balance.pending
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

module.exports = router;
