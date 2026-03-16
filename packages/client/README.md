# @agentwallet/sdk

> Governance infrastructure for AI agents — wallets, spend controls, and the Dead Man's Switch.

[![npm version](https://badge.fury.io/js/@agentwallet%2Fsdk.svg)](https://www.npmjs.com/package/@agentwallet/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is this?

AgentWallet gives your AI agents a financial identity with guardrails:

- **Spend controls** — block or require approval above thresholds
- **Dead Man's Switch** — auto-terminate agents that go silent
- **Kill switch** — instantly freeze all agents in an emergency
- **Audit log** — full transaction history for every agent
- **Cross-agent governance** — rules that cascade to child agents

## Install

```bash
npm install @agentwallet/sdk
```

## Quick Start

```js
const { AgentWallet } = require('@agentwallet/sdk');

const aw = new AgentWallet({ apiKey: 'your-api-key' });

// Spawn an agent with spend limits
const agent = await aw.spawnAgent({
  name: 'trading-agent-001',
  spendLimits: {
    perTransaction: 100,  // block anything over $100
    perDay: 500,          // block if daily spend exceeds $500
  },
  deadManSwitch: {
    timeoutMs: 60_000,    // terminate if no heartbeat for 60s
  },
});

// Start automatic heartbeat (keeps agent alive)
const stopHeartbeat = aw.startHeartbeat(agent.agentId, 30_000);

// Submit a transaction through governance
const tx = await aw.transact(agent.agentId, {
  amount: 75,
  category: 'advertising',
  description: 'Google Ads spend',
});

console.log(tx.status); // 'approved' | 'blocked' | 'pending_approval'

// Emergency stop — terminate everything
await aw.globalKillSwitch('anomalous behavior detected');
```

## Self-Hosting

The SDK is free and open source. Run your own backend:

```bash
git clone https://github.com/JackD720/agentwallet
cd agentwallet/packages/sdk
cp .env.example .env
npm install
npm run dev
```

Then point the SDK at your local server:

```js
const aw = new AgentWallet({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000',
});
```

## Managed Service

Use our hosted backend — no infrastructure to manage, pay per transaction.

→ [agentwallet-v2-sdk.vercel.app](https://agentwallet-v2-sdk.vercel.app)

## API Reference

### `new AgentWallet({ apiKey, baseUrl? })`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | ✓ | Your AgentWallet API key |
| `baseUrl` | string | | Custom backend URL (default: managed service) |

### Agents

| Method | Description |
|--------|-------------|
| `spawnAgent(options)` | Create a new governed agent |
| `listAgents()` | List all agents |
| `getAgent(agentId)` | Get agent details |
| `terminateAgent(agentId)` | Terminate an agent |
| `freezeAgent(agentId)` | Freeze an agent (reversible) |

### Dead Man's Switch

| Method | Description |
|--------|-------------|
| `heartbeat(agentId)` | Ping to keep agent alive |
| `startHeartbeat(agentId, intervalMs?)` | Auto-ping on interval, returns `stop()` |

### Transactions

| Method | Description |
|--------|-------------|
| `transact(agentId, { amount, category })` | Submit through governance |
| `getTransactions(agentId)` | Get transaction history |

### Rules

| Method | Description |
|--------|-------------|
| `addRule(rule)` | Add a spend rule |
| `listRules()` | List all rules |
| `deleteRule(ruleId)` | Remove a rule |

### Emergency

| Method | Description |
|--------|-------------|
| `globalKillSwitch(reason?)` | Terminate ALL agents immediately |

## License

MIT — free to use, self-host, and modify.

---

Built by [Jack Davis](https://github.com/JackD720) · [GitHub](https://github.com/JackD720/agentwallet)
