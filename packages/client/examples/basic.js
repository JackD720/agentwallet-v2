const { AgentWallet } = require('../src/index');

async function main() {
  const aw = new AgentWallet({
    apiKey: process.env.AGENTWALLET_API_KEY || 'your-api-key',
    baseUrl: process.env.AGENTWALLET_BASE_URL || 'http://localhost:3000',
  });

  console.log('Testing AgentWallet SDK...\n');

  // Health check
  const health = await aw.health();
  console.log('✅ Health:', health);

  // Spawn an agent
  const agent = await aw.spawnAgent({
    name: 'test-agent-001',
    spendLimits: { perTransaction: 100, perDay: 500 },
    deadManSwitch: { timeoutMs: 60_000 },
  });
  console.log('✅ Spawned agent:', agent.agentId || agent.id);

  console.log('\nDone!');
}

main().catch(console.error);
