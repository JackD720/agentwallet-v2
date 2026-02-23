# Stripe Integration Guide

AgentWallet supports Stripe for real payment processing. This guide covers setup and usage.

## Setup

### 1. Get Stripe API Keys

1. Create a [Stripe account](https://dashboard.stripe.com/register)
2. Go to [API Keys](https://dashboard.stripe.com/apikeys)
3. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)

### 2. Configure Environment

Add to your `.env` file:

```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
APP_URL=http://localhost:3000
```

### 3. Set Up Webhooks (for production)

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://your-domain.com/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `checkout.session.completed`
   - `payout.paid`
   - `payout.failed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

For local development, use [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

## API Endpoints

### Check Stripe Status

```bash
GET /api/stripe/status
```

Returns whether Stripe is configured.

### Create Deposit (Checkout Session)

Redirect users to Stripe's hosted checkout page:

```bash
POST /api/stripe/deposit/checkout
Content-Type: application/json

{
  "walletId": "wallet-uuid",
  "amount": 100.00,
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

Response:
```json
{
  "message": "Checkout session created",
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

Redirect the user to the `url` to complete payment.

### Create Deposit (Payment Intent)

For custom payment forms using Stripe Elements:

```bash
POST /api/stripe/deposit/intent
Content-Type: application/json

{
  "walletId": "wallet-uuid",
  "amount": 100.00,
  "currency": "usd"
}
```

Response:
```json
{
  "message": "Payment intent created",
  "clientSecret": "pi_..._secret_...",
  "paymentIntentId": "pi_..."
}
```

Use `clientSecret` with Stripe.js to confirm the payment.

### Create Payout

Withdraw funds from a wallet:

```bash
POST /api/stripe/payout
Content-Type: application/json

{
  "walletId": "wallet-uuid",
  "amount": 50.00,
  "destinationAccountId": "acct_..." 
}
```

Note: Full payout support requires Stripe Connect setup.

### Get Platform Balance

```bash
GET /api/stripe/balance
```

Returns Stripe account balance (owner only).

## Flow Examples

### Deposit Flow

```
1. User clicks "Add Funds"
2. Frontend calls POST /api/stripe/deposit/checkout
3. Redirect user to Stripe checkout URL
4. User completes payment on Stripe
5. Stripe redirects to your successUrl
6. Webhook receives payment_intent.succeeded
7. Wallet balance is credited automatically
```

### Agent Payment Flow

```
1. Agent requests transaction via POST /api/transactions
2. Rules engine approves transaction
3. If external payment needed, call Stripe API
4. Deduct from wallet on success
5. Log transaction with Stripe reference
```

## Testing

Use Stripe's test card numbers:

| Card | Number | Result |
|------|--------|--------|
| Success | 4242 4242 4242 4242 | Payment succeeds |
| Decline | 4000 0000 0000 0002 | Payment declined |
| Auth Required | 4000 0025 0000 3155 | Requires 3D Secure |

Use any future expiry date and any 3-digit CVC.

## Security Notes

- Never expose `STRIPE_SECRET_KEY` in frontend code
- Always verify webhook signatures
- Use HTTPS in production
- Store minimal card data (Stripe handles PCI compliance)

## Stripe Connect (Advanced)

For full payout support (paying out to bank accounts), you'll need Stripe Connect:

1. Enable Connect in Stripe Dashboard
2. Create Connected Accounts for users who receive payouts
3. Use `destinationAccountId` when creating payouts

This is optional for MVP - you can start with deposits only.
