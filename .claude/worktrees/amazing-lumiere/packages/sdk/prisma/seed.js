/**
 * Seed script - creates test data for development
 * Run: node prisma/seed.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create an owner (you)
  const owner = await prisma.owner.create({
    data: {
      name: 'Jack',
      email: 'jack@example.com'
    }
  });
  console.log('✅ Created owner:', owner.name);
  console.log('   API Key:', owner.apiKey);

  // Create an AI agent
  const agent = await prisma.agent.create({
    data: {
      name: 'ad-buyer-agent',
      ownerId: owner.id,
      metadata: {
        purpose: 'Automated ad purchasing',
        model: 'gpt-4'
      }
    }
  });
  console.log('\n✅ Created agent:', agent.name);
  console.log('   Agent API Key:', agent.apiKey);

  // Create a wallet for the agent
  const wallet = await prisma.wallet.create({
    data: {
      agentId: agent.id,
      balance: 1000,
      currency: 'USD'
    }
  });
  console.log('\n✅ Created wallet with $1000 balance');
  console.log('   Wallet ID:', wallet.id);

  // Add some spend rules
  const rules = await Promise.all([
    prisma.spendRule.create({
      data: {
        walletId: wallet.id,
        ruleType: 'PER_TRANSACTION_LIMIT',
        parameters: { limit: 100 },
        priority: 1
      }
    }),
    prisma.spendRule.create({
      data: {
        walletId: wallet.id,
        ruleType: 'DAILY_LIMIT',
        parameters: { limit: 500 },
        priority: 2
      }
    }),
    prisma.spendRule.create({
      data: {
        walletId: wallet.id,
        ruleType: 'REQUIRES_APPROVAL',
        parameters: { threshold: 75 },
        priority: 3
      }
    })
  ]);
  console.log('\n✅ Created', rules.length, 'spend rules:');
  console.log('   - Per transaction limit: $100');
  console.log('   - Daily limit: $500');
  console.log('   - Requires approval above: $75');

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Seed complete! Save these keys:\n');
  console.log('OWNER_API_KEY=' + owner.apiKey);
  console.log('AGENT_API_KEY=' + agent.apiKey);
  console.log('WALLET_ID=' + wallet.id);
  console.log('\n' + '='.repeat(50));

  console.log('\n📝 Test commands:\n');
  console.log('# Check balance');
  console.log(`curl http://localhost:3000/api/wallets/${wallet.id}/balance \\`);
  console.log(`  -H "Authorization: Bearer ${agent.apiKey}"\n`);

  console.log('# Make a small payment (should succeed)');
  console.log(`curl -X POST http://localhost:3000/api/transactions \\`);
  console.log(`  -H "Authorization: Bearer ${agent.apiKey}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"walletId":"${wallet.id}","amount":25,"category":"advertising"}'\n`);

  console.log('# Make a medium payment (should require approval)');
  console.log(`curl -X POST http://localhost:3000/api/transactions \\`);
  console.log(`  -H "Authorization: Bearer ${agent.apiKey}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"walletId":"${wallet.id}","amount":80,"category":"advertising"}'\n`);

  console.log('# Make a large payment (should be rejected)');
  console.log(`curl -X POST http://localhost:3000/api/transactions \\`);
  console.log(`  -H "Authorization: Bearer ${agent.apiKey}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"walletId":"${wallet.id}","amount":150,"category":"advertising"}'\n`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
