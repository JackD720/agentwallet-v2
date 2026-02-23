const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Authenticate requests using API key
 * Supports both Owner-level and Agent-level API keys
 * 
 * Header: Authorization: Bearer <api_key>
 */
async function authenticateApiKey(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header',
        hint: 'Use: Authorization: Bearer <your_api_key>'
      });
    }

    const apiKey = authHeader.split(' ')[1];

    // Try to find Owner with this API key
    const owner = await prisma.owner.findUnique({
      where: { apiKey }
    });

    if (owner) {
      req.auth = {
        type: 'owner',
        ownerId: owner.id,
        owner
      };
      return next();
    }

    // Try to find Agent with this API key
    const agent = await prisma.agent.findUnique({
      where: { apiKey },
      include: { owner: true }
    });

    if (agent) {
      if (agent.status !== 'ACTIVE') {
        return res.status(403).json({ 
          error: 'Agent is not active',
          status: agent.status
        });
      }
      
      req.auth = {
        type: 'agent',
        agentId: agent.id,
        ownerId: agent.ownerId,
        agent,
        owner: agent.owner
      };
      return next();
    }

    return res.status(401).json({ error: 'Invalid API key' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Require owner-level authentication
 * Use after authenticateApiKey for routes that need owner access
 */
function requireOwner(req, res, next) {
  if (req.auth?.type !== 'owner') {
    return res.status(403).json({ 
      error: 'Owner-level API key required for this action'
    });
  }
  next();
}

/**
 * Check if authenticated user can access a specific agent
 */
async function canAccessAgent(req, agentId) {
  if (req.auth.type === 'owner') {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, ownerId: req.auth.ownerId }
    });
    return !!agent;
  }
  
  if (req.auth.type === 'agent') {
    return req.auth.agentId === agentId;
  }
  
  return false;
}

module.exports = {
  authenticateApiKey,
  requireOwner,
  canAccessAgent
};
