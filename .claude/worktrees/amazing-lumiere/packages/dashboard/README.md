# Agent Wallet Dashboard

A dark-themed fintech dashboard for monitoring AI agent financial activity.

## Features

- **Overview** - Key metrics at a glance
- **Agents** - View and manage AI agents
- **Wallets** - Monitor wallet balances
- **Transactions** - Full transaction history
- **Approvals** - Review pending transactions
- **Rules** - Configure spend controls

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Connecting to the API

The dashboard proxies `/api` requests to `localhost:3000` (the SDK server).

To use with real data:
1. Start the Agent Wallet SDK server
2. Update the mock data in `App.jsx` with real API calls

## Tech Stack

- React 18
- Vite
- Lucide Icons
- Tailwind-style CSS (custom)
