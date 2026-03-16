/**
 * Stripe Payment Service
 * Handles deposits, payouts, and payment processing
 */

const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initialize Stripe (will be null if no key provided)
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

class StripeService {
  
  /**
   * Check if Stripe is configured
   */
  isConfigured() {
    return !!stripe;
  }

  /**
   * Create a Stripe Customer for an Owner
   * This links the owner to Stripe for payments
   */
  async createCustomer(owner) {
    if (!stripe) {
      console.warn('Stripe not configured - skipping customer creation');
      return null;
    }

    const customer = await stripe.customers.create({
      email: owner.email,
      name: owner.name,
      metadata: {
        ownerId: owner.id
      }
    });

    return customer;
  }

  /**
   * Create a Checkout Session for depositing funds
   * Returns a URL to redirect the user to Stripe's hosted checkout
   */
  async createDepositSession({ walletId, amount, currency = 'usd', successUrl, cancelUrl }) {
    if (!stripe) {
      throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY in environment.');
    }

    // Get wallet and owner info
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { 
        agent: { 
          include: { owner: true } 
        } 
      }
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Wallet Deposit - ${wallet.agent.name}`,
            description: `Add funds to agent wallet`
          },
          unit_amount: Math.round(amount * 100) // Stripe uses cents
        },
        quantity: 1
      }],
      metadata: {
        walletId,
        type: 'deposit'
      },
      customer_email: wallet.agent.owner.email,
      success_url: successUrl || `${process.env.APP_URL}/deposit/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.APP_URL}/deposit/cancel`
    });

    return {
      sessionId: session.id,
      url: session.url
    };
  }

  /**
   * Create a Payment Intent for programmatic deposits
   * Use this for server-to-server deposits without redirect
   */
  async createPaymentIntent({ walletId, amount, currency = 'usd' }) {
    if (!stripe) {
      throw new Error('Stripe not configured');
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { agent: { include: { owner: true } } }
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: {
        walletId,
        type: 'deposit'
      },
      description: `Deposit to agent wallet: ${wallet.agent.name}`
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  }

  /**
   * Handle successful payment - credit the wallet
   * Called by webhook when payment succeeds
   */
  async handlePaymentSuccess(paymentIntent) {
    const { walletId } = paymentIntent.metadata;
    const amount = paymentIntent.amount / 100; // Convert from cents

    if (!walletId) {
      console.error('No walletId in payment metadata');
      return;
    }

    // Credit the wallet
    const wallet = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: amount }
      }
    });

    // Record the transaction
    await prisma.transaction.create({
      data: {
        walletId,
        amount,
        description: 'Stripe deposit',
        category: 'deposit',
        status: 'COMPLETED',
        completedAt: new Date(),
        metadata: {
          type: 'stripe_deposit',
          stripePaymentIntentId: paymentIntent.id,
          source: 'stripe'
        }
      }
    });

    console.log(`Deposited $${amount} to wallet ${walletId}`);
    return wallet;
  }

  /**
   * Create a payout to an external bank account
   * Requires Stripe Connect setup for the owner
   */
  async createPayout({ walletId, amount, destinationAccountId }) {
    if (!stripe) {
      throw new Error('Stripe not configured');
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId }
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (parseFloat(wallet.balance) < amount) {
      throw new Error('Insufficient balance');
    }

    // For full implementation, you'd use Stripe Connect here
    // This is a simplified version that just records the intent
    
    // Deduct from wallet first
    await prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: { decrement: amount }
      }
    });

    // Record as pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        walletId,
        amount,
        description: 'Withdrawal to bank account',
        category: 'withdrawal',
        status: 'PENDING',
        recipientType: 'EXTERNAL',
        metadata: {
          type: 'stripe_payout',
          destinationAccountId
        }
      }
    });

    // In production, you'd create the actual Stripe transfer here:
    // const transfer = await stripe.transfers.create({
    //   amount: Math.round(amount * 100),
    //   currency: 'usd',
    //   destination: destinationAccountId,
    //   metadata: { transactionId: transaction.id }
    // });

    return transaction;
  }

  /**
   * Process a transaction payment to an external recipient
   * This is for when an agent pays for a service
   */
  async processExternalPayment({ transactionId, paymentMethodId }) {
    if (!stripe) {
      throw new Error('Stripe not configured');
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== 'APPROVED') {
      throw new Error('Transaction not approved');
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(transaction.amount) * 100),
      currency: transaction.currency || 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      metadata: {
        transactionId: transaction.id,
        walletId: transaction.walletId,
        type: 'agent_payment'
      }
    });

    if (paymentIntent.status === 'succeeded') {
      // Update transaction as completed
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          metadata: {
            ...transaction.metadata,
            stripePaymentIntentId: paymentIntent.id
          }
        }
      });
    }

    return paymentIntent;
  }

  /**
   * Get Stripe balance (platform balance)
   */
  async getBalance() {
    if (!stripe) {
      return null;
    }

    return await stripe.balance.retrieve();
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook not configured');
    }

    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

module.exports = new StripeService();
