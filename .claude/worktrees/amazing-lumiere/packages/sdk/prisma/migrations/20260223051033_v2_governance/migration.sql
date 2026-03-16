-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentStatus" ADD VALUE 'FROZEN';
ALTER TYPE "AgentStatus" ADD VALUE 'TERMINATED';
ALTER TYPE "AgentStatus" ADD VALUE 'KILLED';

-- CreateTable
CREATE TABLE "AgentLineage" (
    "agentId" TEXT NOT NULL,
    "parentId" TEXT,
    "rootId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "childrenIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "spawnPolicy" JSONB,
    "spawnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentLineage_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "SpawnEvent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "inheritedPolicy" JSONB,
    "authorized" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpawnEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossAgentPolicy" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "targetAgentId" TEXT,
    "targetAgentGroup" TEXT,
    "maxPerTransaction" DECIMAL(18,2) NOT NULL DEFAULT 100,
    "maxDailyToTarget" DECIMAL(18,2) NOT NULL DEFAULT 1000,
    "maxDailyAllAgents" DECIMAL(18,2) NOT NULL DEFAULT 5000,
    "requireHumanApprovalAbove" DECIMAL(18,2) NOT NULL DEFAULT 500,
    "allowedPaymentTypes" TEXT[] DEFAULT ARRAY['compute', 'data', 'api_call', 'service']::TEXT[],
    "requireMutualPolicy" BOOLEAN NOT NULL DEFAULT true,
    "settlementMode" TEXT NOT NULL DEFAULT 'immediate',
    "minCounterpartyTrustScore" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossAgentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossAgentTransaction" (
    "id" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "targetAgentId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentType" TEXT NOT NULL,
    "description" TEXT,
    "policyId" TEXT,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizationMethod" TEXT,
    "settlementStatus" TEXT NOT NULL DEFAULT 'pending',
    "settlementRail" TEXT,
    "requiresHuman" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossAgentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadManSwitchConfig" (
    "agentId" TEXT NOT NULL,
    "heartbeatIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "missedHeartbeatThreshold" INTEGER NOT NULL DEFAULT 3,
    "lastHeartbeatAt" TIMESTAMP(3),
    "anomalyWindowMinutes" INTEGER NOT NULL DEFAULT 60,
    "anomalySpendMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 3.0,
    "anomalyTxCountMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    "maxTxPerMinute" INTEGER NOT NULL DEFAULT 10,
    "maxUniqueVendorsPerHour" INTEGER NOT NULL DEFAULT 20,
    "onAnomaly" TEXT NOT NULL DEFAULT 'alert',
    "onMissedHeartbeat" TEXT NOT NULL DEFAULT 'freeze',
    "onManualTrigger" TEXT NOT NULL DEFAULT 'terminate',
    "cascadeToChildren" BOOLEAN NOT NULL DEFAULT true,
    "notifyParentOnTrigger" BOOLEAN NOT NULL DEFAULT true,
    "autoRecover" BOOLEAN NOT NULL DEFAULT false,
    "recoveryRequiresHuman" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadManSwitchConfig_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "DeadManSwitchEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "details" JSONB,
    "cascadedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadManSwitchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AgentLineage" ADD CONSTRAINT "AgentLineage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLineage" ADD CONSTRAINT "AgentLineage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadManSwitchConfig" ADD CONSTRAINT "DeadManSwitchConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
