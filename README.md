<p align="center">
  <img src="https://img.shields.io/badge/status-beta-yellow" alt="Status: Beta">
  <img src="https://img.shields.io/github/license/JackD720/agentwallet" alt="License: MIT">
  <img src="https://img.shields.io/github/stars/JackD720/agentwallet?style=social" alt="GitHub Stars">
</p>

<h1 align="center">🔐 AgentWallet</h1>

<p align="center">
  <strong>Financial infrastructure for AI agents</strong><br>
  Give your AI agents the ability to spend money safely.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#use-cases">Use Cases</a> •
  <a href="#api-reference">API</a> •
  <a href="#dashboard">Dashboard</a> •
  <a href="https://arxiv.org/abs/2501.10114">Research Paper</a>
</p>

---

## The Problem

AI agents are becoming autonomous. They browse the web, book flights, purchase items, and hire services. But right now, giving an agent financial access means:

- 🚨 Handing over your credit card or API keys
- 🚨 No spending limits or controls
- 🚨 No audit trail of what happened
- 🚨 One bad decision = unlimited damage

## The Solution

AgentWallet provides **wallets with guardrails** for AI agents:

```javascript
import { AgentWallet } from '@agentwallet/sdk';

// Create a wallet with spend controls
const wallet = await AgentWallet.create({
  name: 'shopping-agent',
  dailyLimit: 100.00,
  maxTransaction: 25.00,
  allowedCategories: ['retail', 'groceries']
});

// Agent can now spend within limits
const result = await wallet.spend({
  amount: 19.99,
  recipient: 'amazon.com',
  reason: 'Purchased AA batteries as requested by user'
});

// ✅ Transaction approved - within policy
// Full audit trail logged automatically
```

---

## Quick Start

### Installation

```bash
# Clone the repo
git clone https://github.com/JackD720/agentwallet.git
cd agentwallet

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Run database migrations
npm run db:generate
npm run db:migrate

# Start the server
npm run dev
```

### Basic Usage

```javascript
import { AgentWallet, SpendPolicy } from '@agentwallet/sdk';

// 1. Create a wallet
const wallet = await AgentWallet.create({
  name: 'my-agent',
  policy: new SpendPolicy({
    dailyLimit: 50.00,
    maxTransaction: 20.00,
    requireApproval: false,  // Auto-approve within limits
    allowedMerchants: ['*'], // All merchants
  })
});

// 2. Check balance
const balance = await wallet.getBalance();
console.log(`Available: $${balance.available}`);

// 3. Spend money
const tx = await wallet.spend({
  amount: 15.00,
  recipient: 'stripe.com',
  reason: 'API credits for data processing',
  metadata: { taskId: 'abc123' }
});

// 4. Get transaction history
const history = await wallet.getTransactions({ limit: 10 });

// 5. Update limits on the fly
await wallet.updatePolicy({
  dailyLimit: 100.00  // Increase limit
});
```

---

## Features

### 🔒 Spend Controls

Set granular limits on what your agent can spend:

| Control | Description |
|---------|-------------|
| `dailyLimit` | Maximum spend per 24 hours |
| `weeklyLimit` | Maximum spend per week |
| `monthlyLimit` | Maximum spend per month |
| `maxTransaction` | Maximum single transaction |
| `allowedCategories` | Restrict to specific merchant types |
| `blockedCategories` | Block specific merchant types |
| `allowedMerchants` | Whitelist specific merchants |
| `blockedMerchants` | Blacklist specific merchants |
| `requireApproval` | Human approval for transactions over threshold |
| `timeWindow` | Only allow transactions during certain hours |

### 📊 Complete Audit Trail

Every transaction is logged with full context:

```json
{
  "id": "tx_abc123",
  "timestamp": "2026-01-26T12:00:00Z",
  "amount": 15.00,
  "recipient": "openai.com",
  "status": "approved",
  "reason": "Purchased API credits for task #456",
  "agentId": "agent_xyz",
  "walletId": "wallet_123",
  "policySnapshot": { ... },
  "ruleEvaluations": [
    { "rule": "DAILY_LIMIT", "passed": true },
    { "rule": "MAX_TRANSACTION", "passed": true }
  ],
  "metadata": { "taskId": "456", "model": "gpt-4" }
}
```

### ⚡ Real-time Dashboard

- Live transaction feed showing all agent spending
- Wallet balance overview with charts
- Pending approval queue with one-click approve/reject
- Agent management (pause, resume, configure)
- Spend analytics and trends
- Alert configuration for anomalies

### 🛡️ Rules Engine

Powerful policy engine that evaluates transactions against multiple rules:

```javascript
// Example: Complex policy
const policy = {
  rules: [
    { type: 'DAILY_LIMIT', params: { limit: 500 } },
    { type: 'PER_TRANSACTION_LIMIT', params: { limit: 100 } },
    { type: 'CATEGORY_WHITELIST', params: { categories: ['software', 'advertising'] } },
    { type: 'REQUIRES_APPROVAL', params: { threshold: 75 } },
    { type: 'TIME_WINDOW', params: { startHour: 9, endHour: 17 } }
  ]
};
```

### 🔌 Easy Integrations

Works with popular agent frameworks:

```javascript
// LangChain
import { AgentWalletTool } from '@agentwallet/langchain';
const tools = [new AgentWalletTool(wallet)];

// AutoGPT (coming soon)
// CrewAI (coming soon)
// OpenAI Function Calling (coming soon)
```

---

## Use Cases

### 🛒 Shopping Agents
Agent that purchases items on behalf of users, with budget limits.

### 📈 Trading Agents
AI that trades prediction markets or stocks with strict risk controls.

### 💼 Business Automation
Auto-pay invoices, manage subscriptions, handle procurement.

### 🤖 Autonomous Services
Agents that pay for their own compute, storage, and API calls.

### 🎮 Gaming NPCs
Game characters with real economies and purchasing power.

---

## API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | POST | Create a new agent |
| `/api/agents/:id` | GET | Get agent details |
| `/api/wallets` | POST | Create a wallet for an agent |
| `/api/wallets/:id` | GET | Get wallet balance and details |
| `/api/transactions` | POST | Execute a transaction |
| `/api/transactions` | GET | List transactions with filters |
| `/api/rules` | POST | Add spend rules to a wallet |
| `/api/rules/:id` | DELETE | Remove a spend rule |

### Wallet Methods (SDK)

| Method | Description |
|--------|-------------|
| `AgentWallet.create(config)` | Create a new wallet |
| `wallet.getBalance()` | Get current balance |
| `wallet.spend(params)` | Execute a transaction |
| `wallet.deposit(amount)` | Add funds to wallet |
| `wallet.getTransactions(query)` | Get transaction history |
| `wallet.updatePolicy(policy)` | Update spend controls |
| `wallet.pause()` | Pause all transactions |
| `wallet.resume()` | Resume transactions |

### SpendPolicy Options

```typescript
interface SpendPolicy {
  dailyLimit: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  maxTransaction: number;
  minTransaction?: number;
  allowedCategories?: string[];
  blockedCategories?: string[];
  allowedMerchants?: string[];
  blockedMerchants?: string[];
  requireApproval?: boolean;
  approvalThreshold?: number;
  webhookUrl?: string;
}
```

---

## Dashboard

AgentWallet includes a web dashboard for monitoring:

```bash
# Start both SDK and Dashboard
cd packages/sdk && npm run dev &
cd packages/dashboard && npm run dev
```

Then visit `http://localhost:5173`

**Dashboard Features:**
- Real-time transaction feed
- Wallet balance overview
- Pending approvals queue
- Spend analytics & charts
- Policy management UI
- Agent status controls

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your AI Agent                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentWallet SDK                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Wallet    │  │   Policy    │  │   Audit Logger      │  │
│  │   Manager   │  │   Engine    │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Rules     │  │  Webhooks   │  │   Payment Gateway   │  │
│  │   Engine    │  │             │  │   (Stripe)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                              │
│            (Wallets, Transactions, Policies)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Roadmap

- [x] Core wallet functionality
- [x] Spend policies & limits
- [x] Rules engine (10 rule types)
- [x] Transaction audit logging
- [x] REST API
- [x] React dashboard
- [x] Stripe payment integration
- [ ] LangChain integration
- [ ] Multi-currency support
- [ ] Agent-to-agent transfers
- [ ] Escrow for marketplaces
- [ ] Python SDK
- [ ] Mobile app
- [ ] SOC2 compliance

---

## Research

AgentWallet is referenced in academic research on AI agent infrastructure:

📄 **"Infrastructure for AI Agents"** - [arXiv:2501.10114](https://arxiv.org/abs/2501.10114)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
npm test

# Run linter
npm run lint

# Build for production
npm run build
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- 🌐 [Website](https://agentwallet-three.vercel.app)
- 📄 [Documentation](https://docs.agentwallet.dev) (coming soon)
- 💬 [Discord](https://discord.gg/agentwallet) (coming soon)
- 🐦 [Twitter](https://twitter.com/jackdavis720)

---

<p align="center">
  <strong>Built for the autonomous agent economy.</strong><br>
  <sub>Made with ❤️ by <a href="https://twitter.com/jackdavis720">@jackdavis720</a></sub>
</p>