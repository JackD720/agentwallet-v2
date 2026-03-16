# Agent Wallet SDK

**Financial infrastructure for AI agents** - Wallets, spend controls, and transaction rails.

> "Just as the Internet relies on protocols like HTTPS, agent infrastructure will be similarly indispensable to ecosystems of agents."

## What is this?

An open-source SDK that lets you give AI agents financial capabilities with built-in guardrails:

- 🏦 **Wallets** - Each agent gets its own wallet with balance tracking
- 🛡️ **Spend Rules** - Daily limits, per-transaction limits, category controls, approval flows
- 💸 **Transactions** - Full audit trail of every payment with rule evaluation logs
- 🔐 **Authentication** - API keys for both owners and agents

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL database

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your database URL
```

### 4. Setup Database

```bash
npm run db:generate
npm run db:migrate
```

### 5. Run

```bash
npm run dev
```

Server starts at `http://localhost:3000`

## API Reference

### Authentication

All API routes require authentication via Bearer token:

```
Authorization: Bearer <api_key>
```

Two types of API keys:
- **Owner keys** - Full access to create agents, manage wallets, approve transactions
- **Agent keys** - Limited to their own wallets and transactions

### Agents

```bash
# Create an agent (owner only)
POST /api/agents
{ "name": "my-ai-agent" }

# List agents (owner only)
GET /api/agents

# Get agent details
GET /api/agents/:id

# Pause/activate agent (owner only)
POST /api/agents/:id/pause
POST /api/agents/:id/activate
```

### Wallets

```bash
# Create wallet for an agent
POST /api/wallets
{ "agentId": "agent-uuid" }

# Get wallet details
GET /api/wallets/:id

# Check balance
GET /api/wallets/:id/balance

# Add funds
POST /api/wallets/:id/deposit
{ "amount": 1000 }

# Freeze/unfreeze (owner only)
POST /api/wallets/:id/freeze
POST /api/wallets/:id/unfreeze

# Transaction history
GET /api/wallets/:id/transactions
```

### Spend Rules

```bash
# Add a rule
POST /api/rules
{
  "walletId": "wallet-uuid",
  "ruleType": "DAILY_LIMIT",
  "parameters": { "limit": 500 }
}

# List rules for wallet
GET /api/rules/wallet/:walletId

# Update rule
PATCH /api/rules/:id
{ "parameters": { "limit": 1000 } }

# Delete rule
DELETE /api/rules/:id

# Get all rule types
GET /api/rules/meta/types
```

#### Available Rule Types

| Rule Type | Description | Parameters |
|-----------|-------------|------------|
| `PER_TRANSACTION_LIMIT` | Max per single transaction | `{ limit: number }` |
| `DAILY_LIMIT` | Max spend per day | `{ limit: number }` |
| `WEEKLY_LIMIT` | Max spend per week | `{ limit: number }` |
| `MONTHLY_LIMIT` | Max spend per month | `{ limit: number }` |
| `CATEGORY_WHITELIST` | Only allow certain categories | `{ categories: string[] }` |
| `CATEGORY_BLACKLIST` | Block certain categories | `{ categories: string[] }` |
| `RECIPIENT_WHITELIST` | Only pay certain recipients | `{ recipients: string[] }` |
| `RECIPIENT_BLACKLIST` | Block certain recipients | `{ recipients: string[] }` |
| `TIME_WINDOW` | Only allow during certain hours | `{ startHour: 0-23, endHour: 0-23 }` |
| `REQUIRES_APPROVAL` | Flag for human review above threshold | `{ threshold: number }` |

### Transactions

```bash
# Request payment (main endpoint for agents)
POST /api/transactions
{
  "walletId": "wallet-uuid",
  "amount": 50,
  "category": "advertising",
  "description": "Google Ads spend",
  "recipientId": "google-ads"
}

# Get transaction details
GET /api/transactions/:id

# Approve pending transaction (owner only)
POST /api/transactions/:id/approve

# Reject pending transaction (owner only)
POST /api/transactions/:id/reject
{ "reason": "Budget exceeded" }

# List pending approvals (owner only)
GET /api/transactions/status/pending
```

## Example Flow

```javascript
// 1. Owner creates an agent
const agent = await fetch('/api/agents', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer owner-key' },
  body: JSON.stringify({ name: 'ad-buyer-agent' })
});

// 2. Owner creates a wallet for the agent
const wallet = await fetch('/api/wallets', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer owner-key' },
  body: JSON.stringify({ agentId: agent.id })
});

// 3. Owner adds spend rules
await fetch('/api/rules', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer owner-key' },
  body: JSON.stringify({
    walletId: wallet.id,
    ruleType: 'DAILY_LIMIT',
    parameters: { limit: 500 }
  })
});

// 4. Owner deposits funds
await fetch(`/api/wallets/${wallet.id}/deposit`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer owner-key' },
  body: JSON.stringify({ amount: 1000 })
});

// 5. Agent makes a payment (using agent's API key)
const tx = await fetch('/api/transactions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer agent-key' },
  body: JSON.stringify({
    walletId: wallet.id,
    amount: 50,
    category: 'advertising'
  })
});
// Transaction approved or rejected based on rules!
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Owner     │────▶│  Agent(s)   │────▶│  Wallet(s)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         ▼                         │
              ┌─────────────┐          ┌─────────────┐          ┌───────────────┐
              │ Spend Rules │◀────────▶│Rules Engine │─────────▶│ Transactions  │
              └─────────────┘          └─────────────┘          └───────────────┘
```

## Roadmap

- [ ] Stripe integration for real payments
- [ ] Agent-to-agent transfers
- [ ] Escrow for marketplace transactions
- [ ] Webhooks for transaction events
- [ ] Dashboard UI
- [ ] TypeScript SDK for agent developers

## License

MIT

---

Built for the agent economy 🤖💰
