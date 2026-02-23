/**
 * SpawnGovernor — AgentWallet V2, Feature 1
 *
 * Governs agent spawning with policy inheritance.
 * Children can only be MORE restrictive than parents, never less.
 * Tracks the full agent family tree for lineage-based governance.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SpawnGovernor {
  constructor({ notificationHandler } = {}) {
    this.notify = notificationHandler || null;
  }

  // ─────────────────────────────────────────────────────────────
  // AUTHORIZE SPAWN
  // ─────────────────────────────────────────────────────────────

  /**
   * Authorize a parent agent to spawn a child agent.
   * Derives child policy from parent's policies with optional restrictions.
   */
  async authorizeSpawn(parentAgentId, childAgentId, childPolicyOverrides = {}) {
    // 1. Load parent context
    const parent = await prisma.agent.findUnique({
      where: { id: parentAgentId },
      include: { wallets: { include: { rules: true } } },
    });

    if (!parent) {
      return { authorized: false, reason: 'Parent agent not found' };
    }

    if (parent.status === 'FROZEN' || parent.status === 'TERMINATED' || parent.status === 'KILLED') {
      return {
        authorized: false,
        reason: `Parent agent is ${parent.status.toLowerCase()} and cannot spawn`,
      };
    }

    // 2. Load or create parent lineage
    let parentLineage = await prisma.agentLineage.findUnique({
      where: { agentId: parentAgentId },
    });

    if (!parentLineage) {
      // Root agent with no lineage yet — create it
      parentLineage = await prisma.agentLineage.create({
        data: {
          agentId: parentAgentId,
          parentId: null,
          rootId: parentAgentId,
          depth: 0,
          childrenIds: [],
          status: 'active',
        },
      });
    }

    const spawnPolicy = parentLineage.spawnPolicy || this._defaultSpawnPolicy();

    // 3. Depth check
    if (parentLineage.depth >= spawnPolicy.maxSpawnDepth) {
      return {
        authorized: false,
        reason: `Max spawn depth (${spawnPolicy.maxSpawnDepth}) reached`,
      };
    }

    // 4. Children count check
    if (parentLineage.childrenIds.length >= spawnPolicy.maxChildren) {
      return {
        authorized: false,
        reason: `Max children (${spawnPolicy.maxChildren}) reached`,
      };
    }

    // 5. Can this parent create children? (only matters for non-root agents)
    if (parentLineage.depth > 0 && !spawnPolicy.childrenCanSpawn) {
      return {
        authorized: false,
        reason: 'Parent policy prohibits further spawning',
      };
    }

    // 6. Check child doesn't already exist
    const existingChild = await prisma.agentLineage.findUnique({
      where: { agentId: childAgentId },
    });
    if (existingChild) {
      return { authorized: false, reason: `Agent ${childAgentId} already has a lineage record` };
    }

    // 7. Derive child's inherited policy
    const inheritedPolicy = this._deriveChildPolicy(parent, spawnPolicy, childPolicyOverrides);

    // 8. Create child lineage record
    const childLineage = await prisma.agentLineage.create({
      data: {
        agentId: childAgentId,
        parentId: parentAgentId,
        rootId: parentLineage.rootId,
        depth: parentLineage.depth + 1,
        childrenIds: [],
        status: 'active',
        spawnPolicy: this._restrictSpawnPolicy(spawnPolicy),
      },
    });

    // 9. Add child to parent's children list
    await prisma.agentLineage.update({
      where: { agentId: parentAgentId },
      data: { childrenIds: { push: childAgentId } },
    });

    // 10. Audit log
    await prisma.spawnEvent.create({
      data: {
        parentId: parentAgentId,
        childId: childAgentId,
        depth: childLineage.depth,
        inheritedPolicy,
        authorized: true,
      },
    });

    return {
      authorized: true,
      childAgentId,
      inheritedPolicy,
      lineage: {
        depth: childLineage.depth,
        root: childLineage.rootId,
        canSpawn: childLineage.spawnPolicy?.childrenCanSpawn ?? false,
        parentId: parentAgentId,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TERMINATE LINEAGE
  // ─────────────────────────────────────────────────────────────

  /**
   * Terminate an agent and optionally cascade to all descendants.
   */
  async terminateLineage(agentId, { cascade = true, operatorId = 'system' } = {}) {
    const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
    if (!lineage) return { terminated: [], notFound: [agentId] };

    const terminated = [];

    const _terminate = async (id) => {
      await prisma.agentLineage.update({
        where: { agentId: id },
        data: { status: 'terminated' },
      });
      await prisma.agent.updateMany({
        where: { id },
        data: { status: 'TERMINATED' },
      });
      terminated.push(id);

      if (cascade) {
        const lin = await prisma.agentLineage.findUnique({ where: { agentId: id } });
        if (lin?.childrenIds?.length) {
          for (const childId of lin.childrenIds) {
            await _terminate(childId);
          }
        }
      }
    };

    await _terminate(agentId);

    // Audit
    await prisma.spawnEvent.create({
      data: {
        parentId: operatorId,
        childId: agentId,
        depth: lineage.depth,
        authorized: true,
        inheritedPolicy: null,
        // reusing SpawnEvent table for termination audit; reason field disambiguates
      },
    });

    return { terminated, cascade };
  }

  // ─────────────────────────────────────────────────────────────
  // GET LINEAGE TREE
  // ─────────────────────────────────────────────────────────────

  async getLineage(agentId) {
    const lineage = await prisma.agentLineage.findUnique({ where: { agentId } });
    if (!lineage) return null;

    const buildTree = async (id, depth = 0) => {
      const lin = await prisma.agentLineage.findUnique({ where: { agentId: id } });
      if (!lin) return null;

      const agent = await prisma.agent.findUnique({
        where: { id },
        select: { id: true, name: true, status: true },
      });

      const children = await Promise.all((lin.childrenIds || []).map((cid) => buildTree(cid, depth + 1)));

      return {
        agentId: id,
        name: agent?.name,
        status: lin.status,
        depth: lin.depth,
        parentId: lin.parentId,
        rootId: lin.rootId,
        children: children.filter(Boolean),
      };
    };

    // Walk up to root
    let rootId = lineage.rootId;
    return buildTree(rootId);
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  _defaultSpawnPolicy() {
    return {
      inheritSpendLimits: true,
      inheritVendorAllowlist: true,
      inheritKillSwitch: true,
      maxSpendRatio: 1.0,
      maxTransactionRatio: 1.0,
      maxSpawnDepth: 3,
      maxChildren: 10,
      childrenCanSpawn: true,
      sharedBudget: true,
      childBudgetAllocation: 0.0,
    };
  }

  /**
   * Derive what policy the child should inherit from the parent.
   * Overrides can only make things MORE restrictive.
   */
  _deriveChildPolicy(parent, spawnPolicy, overrides) {
    // Get parent's spend rules as a policy object
    const parentRules = {};
    if (parent.wallets) {
      for (const wallet of parent.wallets) {
        for (const rule of wallet.rules) {
          if (rule.ruleType === 'DAILY_LIMIT') {
            parentRules.dailyLimit = parseFloat(rule.parameters?.limit || 1000);
          }
          if (rule.ruleType === 'PER_TRANSACTION_LIMIT') {
            parentRules.maxSpendPerTx = parseFloat(rule.parameters?.limit || 100);
          }
        }
      }
    }

    // Apply spawn ratios
    const child = {
      dailyLimit: (parentRules.dailyLimit || 1000) * spawnPolicy.maxSpendRatio,
      maxSpendPerTx: (parentRules.maxSpendPerTx || 100) * spawnPolicy.maxTransactionRatio,
      vendorAllowlist: parentRules.vendorAllowlist || [],
    };

    // Apply overrides — only tighter values accepted
    if (overrides.dailyLimit !== undefined) {
      child.dailyLimit = Math.min(overrides.dailyLimit, child.dailyLimit);
    }
    if (overrides.maxSpendPerTx !== undefined) {
      child.maxSpendPerTx = Math.min(overrides.maxSpendPerTx, child.maxSpendPerTx);
    }
    if (overrides.vendorAllowlist !== undefined && parentRules.vendorAllowlist?.length > 0) {
      // Child can only get a subset of parent's allowlist
      child.vendorAllowlist = overrides.vendorAllowlist.filter((v) =>
        parentRules.vendorAllowlist.includes(v)
      );
    }
    if (overrides.daily_limit_ratio !== undefined) {
      child.dailyLimit = child.dailyLimit * Math.min(overrides.daily_limit_ratio, 1.0);
    }

    return child;
  }

  /**
   * When a child agent has its own spawn policy, restrict it vs the parent's.
   */
  _restrictSpawnPolicy(parentPolicy) {
    return {
      ...parentPolicy,
      maxSpawnDepth: Math.max(0, parentPolicy.maxSpawnDepth - 1),
      childrenCanSpawn: parentPolicy.childrenCanSpawn,
    };
  }
}

module.exports = new SpawnGovernor();
module.exports.SpawnGovernor = SpawnGovernor;
