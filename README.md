# AgentWallet

**Governance infrastructure for AI agents that handle money.**

Spend controls, kill switches, audit trails, and multi-agent policy enforcement —
rail-agnostic, framework-agnostic, production-ready.

[![PyPI](https://img.shields.io/pypi/v/agentwallet-gov)](https://pypi.org/project/agentwallet-gov/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![arXiv](https://img.shields.io/badge/arXiv-2501.10114-b31b1b.svg)](https://arxiv.org/abs/2501.10114)

---

## The problem

AI agents are being given access to real money. They can call APIs, execute trades,
pay vendors, and spin up infrastructure — autonomously, at machine speed.

There's no governance layer. No spend controls. No kill switch. No audit trail.

AgentWallet is that layer.

---

## What it does

Every financial action an agent takes flows through AgentWallet before any money moves.

```
Agent decides to spend
        ↓
AgentWallet rules engine evaluates:
  • Per-transaction limit
  • Daily / weekly / monthly limits  
  • Category whitelist / blacklist
  • Recipient whitelist / blacklist
  • Kill switch status
  • Time window restrictions
  • Human approval thresholds
        ↓
APPROVED → money moves (via your payment rail)
REJECTED → agent told why, nothing moves
PENDING  → human approval required
```

Everything is logged to an immutable audit trail.

---

## Quick start

### Python (LangChain, CrewAI, AutoGen)

```bash
pip install agentwallet-gov
```

**LangChain:**
```python
from agentwallet_gov import AgentWalletToolkit

toolkit = AgentWalletToolkit(
    api_url="https://your-api.run.app",
    api_key="your-owner-key",
    wallet_id="your-wallet-id",
)

agent = initialize_agent(
    tools=toolkit.get_tools(),
    llm=ChatOpenAI(),
    agent=AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION,
)
# Every spend now flows through governance
```

**CrewAI:**
```python
from agentwallet_gov import AgentWalletTools

tools = AgentWalletTools(api_url=..., api_key=..., wallet_id=...)
agent = Agent(role="Finance Operator", tools=tools.get_tools())
```

**AutoGen:**
```python
from agentwallet_gov import register_agentwallet_tools

register_agentwallet_tools(agent=assistant, executor=proxy,
    api_url=..., api_key=..., wallet_id=...)
```

### TypeScript (Mastra)

```typescript
import { createAgentWalletTools } from './packages/integrations/agentwallet-mastra';

const tools = createAgentWalletTools({
  apiUrl: process.env.AGENTWALLET_API_URL,
  apiKey: process.env.AGENTWALLET_API_KEY,
  walletId: process.env.AGENTWALLET_WALLET_ID,
});

const agent = new Agent({ name: 'Finance Agent', tools });
```

### MCP (Claude Desktop, Cursor, Cline)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentwallet": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/server.js"],
      "env": {
        "AGENTWALLET_API_URL": "https://your-api.run.app",
        "AGENTWALLET_API_KEY": "your-owner-key"
      }
    }
  }
}
```

Now Claude Desktop can govern AI agents directly from chat.

---

## Core features

### Spend controls
10 rule types: per-transaction limits, daily/weekly/monthly caps,
category whitelists/blacklists, recipient whitelists/blacklists,
time window restrictions, human approval thresholds.

### Kill switch
Automatic triggers: drawdown %, loss amount, consecutive losses, daily loss limit.
Manual emergency stop. Reversible. Cascades to child agents.

### Multi-agent spawn governance
Child agents inherit parent policies and can never have MORE permissions than their parent.
The governance engine enforces this automatically — no config required.

```
Parent Agent ($500/day limit)
    └── Child Agent A ($250/day — 50% ratio, enforced)
    └── Child Agent B ($100/day — custom override)
        └── Grandchild Agent ($50/day — inherited)
```

### Audit trail
Every transaction attempt, rule evaluation, kill switch trigger, and governance
decision is logged with full reasoning. Export as JSON or CSV. SOC2-ready
compliance reports built in.

### Payment rail adapters
- **Coinbase Agentic Wallet** — governance gate for on-chain transactions
- **Stripe x402** — intercept and govern HTTP payment flows
- REST API — connect any payment rail

---

## MCP tools

When connected via MCP, Claude Desktop gets 9 governance tools:

| Tool | Description |
|---|---|
| `authorize_spend` | Run a transaction through the rules engine |
| `set_rule` | Add a governance rule to a wallet |
| `kill_switch` | Emergency stop, configure triggers, or reset |
| `get_audit_log` | Query the immutable audit trail |
| `get_wallet_status` | Balance + active rules + kill switch state |
| `list_agents` | List all agents under your owner account |
| `create_agent` | Provision a new governed agent |
| `spawn_agent` | Spawn a child agent with inherited policy |
| `get_compliance_report` | SOC2-ready compliance summary |

---

## Self-hosting

```bash
# 1. Clone
git clone https://github.com/JackD720/agentwallet-v2
cd agentwallet-v2

# 2. Configure
cp packages/sdk/.env.example packages/sdk/.env
# Add DATABASE_URL (PostgreSQL / Supabase)

# 3. Run
cd packages/sdk
npm install
npx prisma migrate dev
npm start
# API running on :3000
```

**Deploy to Cloud Run:**
```bash
gcloud run deploy agentwallet-sdk \
  --source packages/sdk \
  --set-env-vars DATABASE_URL=your-db-url
```

---

## Architecture

```
Claude / Cursor / LangChain / CrewAI / AutoGen / Mastra
                    │
         MCP (stdio) or REST API
                    │
            AgentWallet SDK
         (Node.js / Express / Prisma)
                    │
              PostgreSQL
         (Wallets · Rules · Audit)
                    │
         Payment Rails (optional)
    Coinbase · Stripe · Bank API · etc.
```

AgentWallet is a governance layer, not a payment rail.
Plug in whatever rail you use — AgentWallet sits in front and governs what gets through.

---

## Packages

| Package | Description |
|---|---|
| `packages/sdk` | Core API (Node.js / Express / Prisma) |
| `packages/mcp-server` | MCP server for Claude Desktop, Cursor, Cline |
| `packages/integrations` | LangChain, CrewAI, AutoGen, Mastra wrappers |
| `packages/dashboard` | React governance dashboard |
| `packages/client` | TypeScript SDK client |

---

## Research

AgentWallet is grounded in academic research on AI agent infrastructure:

📄 **"Infrastructure for AI Agents"** — [arXiv:2501.10114](https://arxiv.org/abs/2501.10114)

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <strong>Built for the autonomous agent economy.</strong><br>
  <sub>
    <a href="https://pypi.org/project/agentwallet-gov/">PyPI</a> ·
    <a href="https://arxiv.org/abs/2501.10114">Research</a> ·
    <a href="https://twitter.com/jackdavis720">@jackdavis720</a>
  </sub>
</p>
