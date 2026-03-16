const express = require('express');
const stripeService = require('../services/stripeService');

const router = express.Router();

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 * 
 * IMPORTANT: This route must use raw body parsing, not JSON
 * Configure in index.js before json middleware
 */
router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(400).json({ error: 'No signature provided' });
  }

  let event;

  try {
    event = stripeService.verifyWebhookSignature(req.body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'payout.paid':
        await handlePayoutPaid(event.data.object);
        break;

      case 'payout.failed':
        await handlePayoutFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);
  
  const { type } = paymentIntent.metadata;
  
  if (type === 'deposit') {
    await stripeService.handlePaymentSuccess(paymentIntent);
  }
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);
  
  const { walletId, transactionId } = paymentIntent.metadata;
  
  // Could update transaction status to FAILED here
  // and notify the owner
}

/**
 * Handle completed checkout session
 */
async function handleCheckoutCompleted(session) {
  console.log('Checkout completed:', session.id);
  
  // If this was a deposit checkout, the payment_intent.succeeded
  // event will handle crediting the wallet
  
  // But we can also handle it here if payment_intent is available
  if (session.payment_intent && session.metadata?.type === 'deposit') {
    // Retrieve the full payment intent
    // await stripeService.handlePaymentSuccess(...)
  }
}

/**
 * Handle successful payout
 */
async function handlePayoutPaid(payout) {
  console.log('Payout completed:', payout.id);
  
  // Update the transaction status to COMPLETED
  const { transactionId } = payout.metadata || {};
  
  if (transactionId) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
  }
}

/**
 * Handle failed payout
 */
async function handlePayoutFailed(payout) {
  console.log('Payout failed:', payout.id);
  
  const { transactionId, walletId, amount } = payout.metadata || {};
  
  if (transactionId && walletId && amount) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Refund the wallet
    await prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: parseFloat(amount) }
      }
    });
    
    // Mark transaction as failed
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'FAILED',
        metadata: {
          failureReason: payout.failure_message
        }
      }
    });
  }
}

module.exports = router;
