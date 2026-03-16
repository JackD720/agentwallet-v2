export interface AgentWalletOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface SpendLimits {
  perTransaction?: number;
  perDay?: number;
}

export interface DeadManSwitchConfig {
  timeoutMs?: number;
}

export interface SpawnAgentOptions {
  name: string;
  spendLimits?: SpendLimits;
  deadManSwitch?: DeadManSwitchConfig;
  metadata?: Record<string, unknown>;
}

export interface TransactOptions {
  amount: number;
  category: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface Rule {
  name: string;
  action: 'block' | 'require_approval' | 'allow';
  condition: {
    field: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number | string;
  };
}

export interface AuditLogOptions {
  agentId?: string;
  limit?: number;
}

export interface GetTransactionsOptions {
  limit?: number;
}

export class AgentWallet {
  constructor(options: AgentWalletOptions);

  health(): Promise<{ status: string }>;

  spawnAgent(options: SpawnAgentOptions): Promise<{ agentId: string; name: string; status: string }>;
  listAgents(): Promise<{ agents: unknown[] }>;
  getAgent(agentId: string): Promise<unknown>;
  terminateAgent(agentId: string, options?: { reason?: string }): Promise<void>;
  freezeAgent(agentId: string, options?: { reason?: string }): Promise<void>;

  heartbeat(agentId: string): Promise<{ ok: boolean }>;
  startHeartbeat(agentId: string, intervalMs?: number): () => void;

  getWallet(agentId: string): Promise<unknown>;
  getBalance(agentId: string): Promise<{ balance: number }>;

  transact(agentId: string, options: TransactOptions): Promise<{ status: 'approved' | 'blocked' | 'pending_approval'; transactionId?: string }>;
  getTransactions(agentId: string, options?: GetTransactionsOptions): Promise<{ transactions: unknown[] }>;

  addRule(rule: Rule): Promise<{ ruleId: string }>;
  listRules(): Promise<{ rules: unknown[] }>;
  deleteRule(ruleId: string): Promise<void>;

  getAuditLog(options?: AuditLogOptions): Promise<{ events: unknown[] }>;

  globalKillSwitch(reason?: string): Promise<void>;
}
