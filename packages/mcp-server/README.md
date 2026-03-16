# AgentWallet MCP Server

Governance infrastructure for AI agents — exposed as MCP tools so any agent
framework can add spend controls, kill switches, and audit trails with zero
backend wiring.

## Tools

| Tool | What it does |
|---|---|
| `authorize_spend` | Run a transaction through the rules engine. Returns approved/rejected + which rules fired. |
| `set_rule` | Add a governance rule to a wallet (spend limits, category controls, time windows, approval thresholds). |
| `kill_switch` | Emergency stop, configure automatic triggers, or reset after review. |
| `get_audit_log` | Query the immutable audit trail. Supports raw logs, summaries, and SOC2-ready compliance reports. |
| `get_wallet_status` | Balance + active rules + kill switch state for a wallet. |
| `list_agents` | List all agents under your owner account with their IDs. |
| `create_agent` | Provision a new governed agent with a wallet. |

## Prerequisites

You need a running AgentWallet API. Deploy from the main repo:

```bash
# Clone the SDK
git clone https://github.com/JackD720/agentwallet
cd agentwallet/packages/sdk

# Set up env
cp .env.example .env
# Add DATABASE_URL, OWNER_API_KEY to .env

# Run
npm install && npm start
```

## Install

```bash
npm install -g @jackd720/agentwallet-mcp
# or run directly with npx:
npx @jackd720/agentwallet-mcp
```

## Configuration

Two env vars required:

| Var | Description |
|---|---|
| `AGENTWALLET_API_URL` | URL of your AgentWallet API. Default: `http://localhost:3000` |
| `AGENTWALLET_API_KEY` | Your owner API key from the AgentWallet API |

---

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentwallet": {
      "command": "npx",
      "args": ["@jackd720/agentwallet-mcp"],
      "env": {
        "AGENTWALLET_API_URL": "https://your-api.run.app",
        "AGENTWALLET_API_KEY": "your-owner-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see 7 new tools in the tool picker.

---

## Cursor / Cline

Add to `.cursor/mcp.json` or `.cline/mcp_settings.json` at repo root:

```json
{
  "mcpServers": {
    "agentwallet": {
      "command": "npx",
      "args": ["@jackd720/agentwallet-mcp"],
      "env": {
        "AGENTWALLET_API_URL": "https://your-api.run.app",
        "AGENTWALLET_API_KEY": "your-owner-api-key"
      }
    }
  }
}
```

---

## LangChain (via MCP adapter)

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "agentwallet": {
        "command": "npx",
        "args": ["@jackd720/agentwallet-mcp"],
        "env": {
            "AGENTWALLET_API_URL": "https://your-api.run.app",
            "AGENTWALLET_API_KEY": "your-owner-api-key",
        },
        "transport": "stdio",
    }
})

tools = await client.get_tools()
agent = create_react_agent("anthropic:claude-sonnet-4-5", tools)

# Every spend the agent attempts now flows through AgentWallet governance
result = await agent.ainvoke({
    "messages": "Pay $50 to OpenAI for API usage"
})
```

---

## CrewAI

```python
import subprocess
from crewai_tools import MCPServerAdapter

with MCPServerAdapter({
    "command": "npx",
    "args": ["@jackd720/agentwallet-mcp"],
    "env": {
        "AGENTWALLET_API_URL": "https://your-api.run.app",
        "AGENTWALLET_API_KEY": "your-owner-api-key",
    }
}) as mcp:
    tools = mcp.tools
    # Pass tools to your CrewAI agent
```

---

## Quick example: governed trading agent

```
User: Set up a trading agent with a $500 daily limit, block crypto exchanges,
      and stop automatically if I lose more than $100.

Claude uses:
  1. create_agent          → provisions "Trading Agent" with wallet
  2. set_rule              → DAILY_LIMIT { limit: 500 }
  3. set_rule              → CATEGORY_BLACKLIST { categories: ["crypto"] }
  4. kill_switch (configure) → DAILY_LOSS_LIMIT { threshold: 100 }

User: Try to spend $600 on trading.

Claude uses:
  5. authorize_spend       → REJECTED — daily limit exceeded
  
User: What happened?

Claude uses:
  6. get_audit_log (summary) → shows the blocked transaction and which rule fired
```

---

## Local development

```bash
git clone https://github.com/JackD720/agentwallet-mcp
cd agentwallet-mcp

npm install

AGENTWALLET_API_URL=http://localhost:3000 \
AGENTWALLET_API_KEY=your-key \
npm start
```

The server speaks MCP over stdio. Point any MCP inspector at it to test all tools.

---

## Architecture

```
Claude / Cursor / LangChain
         │  MCP (stdio)
         ▼
  agentwallet-mcp server
         │  REST
         ▼
  AgentWallet API (Node/Express)
         │  Prisma
         ▼
  PostgreSQL
```

The MCP server is a thin translation layer — it validates inputs,
calls the AgentWallet REST API, and formats responses for the LLM.
All governance logic lives in the API.

---

## Published package

```
npm: @jackd720/agentwallet-mcp
```
