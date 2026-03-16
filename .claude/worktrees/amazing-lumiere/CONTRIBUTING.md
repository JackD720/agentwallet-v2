# Contributing to AgentWallet

First off, thanks for taking the time to contribute! 🎉

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, curl commands)
- **Describe the behavior you observed and what you expected**
- **Include logs** if applicable

### Suggesting Features

Feature suggestions are welcome! Please:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested feature
- **Explain why this feature would be useful**
- **List any alternatives you've considered**

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `npm install` in both `packages/sdk` and `packages/dashboard`
3. **Make your changes**
4. **Test your changes** thoroughly
5. **Update documentation** if needed
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/agentwallet.git
cd agentwallet

# Install SDK dependencies
cd packages/sdk
npm install
cp .env.example .env
# Configure your database URL in .env

# Run migrations
npm run db:generate
npm run db:migrate

# Start development server
npm run dev

# In another terminal, start the dashboard
cd packages/dashboard
npm install
npm run dev
```

### Project Structure

```
agentwallet/
├── packages/
│   ├── sdk/                 # Core API server
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   └── middleware/  # Auth, error handling
│   │   └── prisma/          # Database schema
│   └── dashboard/           # React frontend
│       └── src/
├── docs/                    # Documentation
└── examples/                # Example integrations
```

### Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and small
- Write descriptive commit messages

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add weekly spend limit rule type
fix: correct balance calculation on rejected transactions
docs: update API reference with new endpoints
refactor: simplify rules engine evaluation logic
```

### Testing

Before submitting a PR:

1. Test the SDK endpoints manually or with the seed script
2. Verify the dashboard displays data correctly
3. Check that existing functionality still works

## Areas We Need Help

### High Priority

- **Stripe Integration** — Connect real payment processing
- **Testing** — Unit and integration tests
- **TypeScript** — Convert SDK to TypeScript

### Medium Priority

- **Python SDK** — Port the SDK to Python
- **Webhooks** — Event notifications for transactions
- **Rate Limiting** — API rate limiting

### Nice to Have

- **Additional Rule Types** — More spend control options
- **Dashboard Features** — Charts, analytics, export
- **Docker** — Containerized deployment

## Questions?

Feel free to open an issue with the `question` label or reach out directly.

Thanks for contributing! 🚀
