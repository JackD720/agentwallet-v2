# AgentWallet V2 🤠🔫

Governance infrastructure for autonomous AI agents.

## What is it?
AgentWallet is the policy and control layer for AI agents that handle money. 
As agents become more autonomous, you need a way to govern their behavior 
before they go rogue.

## Features
- **Dead Man's Switch** — automatically freezes or terminates agents that 
  go dark, spend abnormally, or hit velocity limits. Cascades to children.
- **Agent Spawn Governance** — child agents inherit parent policies and can 
  never have MORE permissions than their parent
- **Cross-Agent Transaction Policies** — govern agent-to-agent payments
- **Coinbase Agentic Wallet Adapter** — governance gate for on-chain transactions
- **Stripe x402 Proxy** — intercept and govern HTTP payment flows

## Quick Start
npm install → set DATABASE_URL → npx prisma migrate dev → node src/index.js

## Built with
Node.js · Express · Prisma · PostgreSQL · Supabase

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
