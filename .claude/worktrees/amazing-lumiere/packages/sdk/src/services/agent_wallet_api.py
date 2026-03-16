"""
AgentWallet API Server
FastAPI wrapper for the AgentWallet Kalshi integration.

Run with: uvicorn agent_wallet_api:app --reload --port 8100
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent_wallet_kalshi import (
    AgentWalletManager,
    SpendLimit,
    Rule,
    RuleResult,
    ActionType,
)


# ─────────────────────────────────────────────────────────────────
# Pydantic Models (Request/Response)
# ─────────────────────────────────────────────────────────────────

class SpendLimitCreate(BaseModel):
    max_per_order: int = Field(5000, description="Max cents per order")
    max_per_day: int = Field(20000, description="Max cents per day")
    max_per_week: int = Field(50000, description="Max cents per week")
    max_position_size: int = Field(100, description="Max contracts per position")
    allowed_tickers: Optional[List[str]] = None
    blocked_tickers: List[str] = Field(default_factory=list)


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    spend_limit: Optional[SpendLimitCreate] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    agent_id: str
    name: str
    description: str
    created_at: str
    is_active: bool
    metadata: Dict[str, Any]


class OrderCreate(BaseModel):
    ticker: str
    side: str = Field(..., pattern="^(yes|no)$")
    action: str = Field(..., pattern="^(buy|sell)$")
    count: int = Field(..., gt=0)
    type: str = Field("limit", pattern="^(limit|market)$")
    yes_price: Optional[int] = Field(None, ge=1, le=99)
    no_price: Optional[int] = Field(None, ge=1, le=99)
    client_order_id: Optional[str] = None


class RuleCreate(BaseModel):
    rule_id: str
    name: str
    description: str
    condition_type: str  # "max_order_value", "ticker_block", "time_block", etc.
    condition_params: Dict[str, Any]
    action: str = Field(..., pattern="^(allow|deny|require_approval)$")
    priority: int = 0


class KillSwitchRequest(BaseModel):
    reason: str = ""


class ApprovalRequest(BaseModel):
    request_id: str
    approved: bool
    approver: str = ""


# ─────────────────────────────────────────────────────────────────
# Global State
# ─────────────────────────────────────────────────────────────────

manager: Optional[AgentWalletManager] = None

# Pending approvals storage (in production, use Redis or DB)
pending_approvals: Dict[str, Dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize manager on startup."""
    global manager
    
    api_key_id = os.environ.get("KALSHI_API_KEY_ID")
    private_key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "~/.kalshi/private_key.pem")
    
    if not api_key_id:
        print("WARNING: KALSHI_API_KEY_ID not set. Using demo key.")
        api_key_id = "Ce00cf3a-1002-4eab-aa9c-b69560921052"
    
    manager = AgentWalletManager(
        kalshi_api_key_id=api_key_id,
        kalshi_private_key_path=private_key_path,
        audit_log_file="agent_wallet_audit.jsonl",
    )
    
    print(f"AgentWallet API started with Kalshi key: {api_key_id[:8]}...")
    yield
    print("AgentWallet API shutting down")


# ─────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AgentWallet API",
    description="Financial infrastructure for AI agents with spend controls, rules engine, and audit logging.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_manager() -> AgentWalletManager:
    if manager is None:
        raise HTTPException(status_code=503, detail="Manager not initialized")
    return manager


# ─────────────────────────────────────────────────────────────────
# Health & Status
# ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/status")
async def status(mgr: AgentWalletManager = Depends(get_manager)):
    try:
        balance = mgr.kalshi_client.get_balance()
        return {
            "status": "connected",
            "kalshi_balance_cents": balance.get("balance", 0),
            "agents_count": len(mgr.agents),
            "rules_count": len(mgr.rules_engine.rules),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ─────────────────────────────────────────────────────────────────
# Agents
# ─────────────────────────────────────────────────────────────────

@app.post("/agents", response_model=AgentResponse)
async def create_agent(
    req: AgentCreate,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Create a new agent with wallet."""
    spend_limit = None
    if req.spend_limit:
        spend_limit = SpendLimit(
            max_per_order=req.spend_limit.max_per_order,
            max_per_day=req.spend_limit.max_per_day,
            max_per_week=req.spend_limit.max_per_week,
            max_position_size=req.spend_limit.max_position_size,
            allowed_tickers=req.spend_limit.allowed_tickers,
            blocked_tickers=req.spend_limit.blocked_tickers,
        )
    
    agent = mgr.create_agent(
        name=req.name,
        description=req.description,
        spend_limit=spend_limit,
        metadata=req.metadata,
    )
    
    return AgentResponse(
        agent_id=agent.agent_id,
        name=agent.name,
        description=agent.description,
        created_at=agent.created_at,
        is_active=agent.is_active,
        metadata=agent.metadata,
    )


@app.get("/agents", response_model=List[AgentResponse])
async def list_agents(mgr: AgentWalletManager = Depends(get_manager)):
    """List all agents."""
    return [
        AgentResponse(
            agent_id=a.agent_id,
            name=a.name,
            description=a.description,
            created_at=a.created_at,
            is_active=a.is_active,
            metadata=a.metadata,
        )
        for a in mgr.agents.values()
    ]


@app.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get agent details."""
    if agent_id not in mgr.agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    a = mgr.agents[agent_id]
    return AgentResponse(
        agent_id=a.agent_id,
        name=a.name,
        description=a.description,
        created_at=a.created_at,
        is_active=a.is_active,
        metadata=a.metadata,
    )


@app.post("/agents/{agent_id}/deactivate")
async def deactivate_agent(
    agent_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Deactivate an agent."""
    mgr.deactivate_agent(agent_id)
    return {"status": "deactivated", "agent_id": agent_id}


@app.post("/agents/{agent_id}/activate")
async def activate_agent(
    agent_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Reactivate an agent."""
    mgr.activate_agent(agent_id)
    return {"status": "activated", "agent_id": agent_id}


# ─────────────────────────────────────────────────────────────────
# Wallet Operations
# ─────────────────────────────────────────────────────────────────

@app.get("/agents/{agent_id}/balance")
async def get_balance(
    agent_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get agent's Kalshi balance."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.get_balance()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/agents/{agent_id}/positions")
async def get_positions(
    agent_id: str,
    limit: int = 100,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get agent's positions."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.get_positions(limit=limit)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/agents/{agent_id}/markets")
async def get_markets(
    agent_id: str,
    status: Optional[str] = None,
    limit: int = 100,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get available markets."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.get_markets(status=status, limit=limit)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/agents/{agent_id}/orderbook/{ticker}")
async def get_orderbook(
    agent_id: str,
    ticker: str,
    depth: int = 10,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get orderbook for a market."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.get_orderbook(ticker=ticker, depth=depth)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─────────────────────────────────────────────────────────────────
# Trading
# ─────────────────────────────────────────────────────────────────

@app.post("/agents/{agent_id}/orders")
async def create_order(
    agent_id: str,
    order: OrderCreate,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """
    Create an order through spend controls.
    
    Returns 403 if denied by rules or spend limits.
    Returns 202 if requires approval (check /approvals/pending).
    """
    try:
        wallet = mgr.get_wallet(agent_id)
        result = wallet.create_order(
            ticker=order.ticker,
            side=order.side,
            action=order.action,
            count=order.count,
            type=order.type,
            yes_price=order.yes_price,
            no_price=order.no_price,
            client_order_id=order.client_order_id,
        )
        return {"status": "executed", "order": result}
    
    except PermissionError as e:
        error_msg = str(e)
        
        # Check if requires approval
        if "Requires approval" in error_msg:
            import uuid
            request_id = str(uuid.uuid4())
            pending_approvals[request_id] = {
                "request_id": request_id,
                "agent_id": agent_id,
                "order": order.model_dump(),
                "created_at": datetime.utcnow().isoformat(),
                "status": "pending",
                "reason": error_msg,
            }
            return {
                "status": "pending_approval",
                "request_id": request_id,
                "message": error_msg,
            }
        
        raise HTTPException(status_code=403, detail=error_msg)
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/agents/{agent_id}/orders/{order_id}")
async def cancel_order(
    agent_id: str,
    order_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Cancel an order."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.cancel_order(order_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/agents/{agent_id}/orders")
async def cancel_all_orders(
    agent_id: str,
    ticker: Optional[str] = None,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Cancel all resting orders."""
    try:
        wallet = mgr.get_wallet(agent_id)
        return wallet.cancel_all_orders(ticker=ticker)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─────────────────────────────────────────────────────────────────
# Approvals
# ─────────────────────────────────────────────────────────────────

@app.get("/approvals/pending")
async def list_pending_approvals():
    """List all pending approval requests."""
    return {
        "pending": [
            v for v in pending_approvals.values()
            if v["status"] == "pending"
        ]
    }


@app.get("/approvals/{request_id}")
async def get_approval(request_id: str):
    """Get approval request details."""
    if request_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return pending_approvals[request_id]


@app.post("/approvals/{request_id}")
async def process_approval(
    request_id: str,
    approval: ApprovalRequest,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Approve or deny a pending request."""
    if request_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    req = pending_approvals[request_id]
    
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    if approval.approved:
        # Execute the order directly (bypass rules since manually approved)
        try:
            wallet = mgr.get_wallet(req["agent_id"])
            order_data = req["order"]
            
            # Call underlying client directly to bypass rules
            result = wallet.client.create_order(
                ticker=order_data["ticker"],
                side=order_data["side"],
                action=order_data["action"],
                count=order_data["count"],
                type=order_data["type"],
                yes_price=order_data.get("yes_price"),
                no_price=order_data.get("no_price"),
                client_order_id=order_data.get("client_order_id"),
            )
            
            req["status"] = "approved"
            req["approved_by"] = approval.approver
            req["approved_at"] = datetime.utcnow().isoformat()
            req["result"] = result
            
            return {"status": "approved", "order": result}
        
        except Exception as e:
            req["status"] = "failed"
            req["error"] = str(e)
            raise HTTPException(status_code=500, detail=str(e))
    else:
        req["status"] = "denied"
        req["denied_by"] = approval.approver
        req["denied_at"] = datetime.utcnow().isoformat()
        return {"status": "denied"}


# ─────────────────────────────────────────────────────────────────
# Kill Switch
# ─────────────────────────────────────────────────────────────────

@app.post("/agents/{agent_id}/kill-switch")
async def agent_kill_switch(
    agent_id: str,
    req: KillSwitchRequest,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Activate kill switch for a single agent."""
    try:
        wallet = mgr.get_wallet(agent_id)
        result = wallet.activate_kill_switch(req.reason)
        return {"status": "kill_switch_activated", "agent_id": agent_id, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/agents/{agent_id}/kill-switch")
async def agent_kill_switch_off(
    agent_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Deactivate kill switch for a single agent."""
    try:
        wallet = mgr.get_wallet(agent_id)
        wallet.deactivate_kill_switch()
        return {"status": "kill_switch_deactivated", "agent_id": agent_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/kill-switch")
async def global_kill_switch(
    req: KillSwitchRequest,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Activate kill switch for ALL agents."""
    result = mgr.global_kill_switch(req.reason)
    return {"status": "global_kill_switch_activated", "results": result}


# ─────────────────────────────────────────────────────────────────
# Rules
# ─────────────────────────────────────────────────────────────────

def build_condition(condition_type: str, params: Dict[str, Any]):
    """Build a rule condition function from type and params."""
    
    if condition_type == "max_order_value":
        threshold = params.get("threshold", 10000)
        return lambda ctx: ctx.get("order_value", 0) > threshold
    
    elif condition_type == "ticker_block":
        blocked = params.get("tickers", [])
        return lambda ctx: ctx.get("ticker", "") in blocked
    
    elif condition_type == "time_block":
        # Block during certain hours (UTC)
        start_hour = params.get("start_hour", 0)
        end_hour = params.get("end_hour", 6)
        return lambda ctx: start_hour <= datetime.utcnow().hour < end_hour
    
    elif condition_type == "weekend_block":
        return lambda ctx: datetime.utcnow().weekday() >= 5
    
    elif condition_type == "position_size":
        max_size = params.get("max_size", 100)
        return lambda ctx: ctx.get("count", 0) > max_size
    
    elif condition_type == "daily_spend":
        threshold = params.get("threshold", 50000)
        return lambda ctx: ctx.get("daily_spend", 0) > threshold
    
    else:
        raise ValueError(f"Unknown condition type: {condition_type}")


@app.post("/rules")
async def create_rule(
    rule: RuleCreate,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Add a new rule to the engine."""
    try:
        condition = build_condition(rule.condition_type, rule.condition_params)
        
        action_map = {
            "allow": RuleResult.ALLOW,
            "deny": RuleResult.DENY,
            "require_approval": RuleResult.REQUIRE_APPROVAL,
        }
        
        new_rule = Rule(
            rule_id=rule.rule_id,
            name=rule.name,
            description=rule.description,
            condition=condition,
            action=action_map[rule.action],
            priority=rule.priority,
        )
        
        mgr.add_rule(new_rule)
        
        return {
            "status": "created",
            "rule_id": rule.rule_id,
            "name": rule.name,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/rules")
async def list_rules(mgr: AgentWalletManager = Depends(get_manager)):
    """List all rules."""
    return {
        "rules": [
            {
                "rule_id": r.rule_id,
                "name": r.name,
                "description": r.description,
                "action": r.action.value,
                "priority": r.priority,
                "is_active": r.is_active,
            }
            for r in mgr.rules_engine.rules.values()
        ]
    }


@app.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Remove a rule."""
    mgr.rules_engine.remove_rule(rule_id)
    return {"status": "deleted", "rule_id": rule_id}


# ─────────────────────────────────────────────────────────────────
# Audit Log
# ─────────────────────────────────────────────────────────────────

@app.get("/audit")
async def get_audit_log(
    agent_id: Optional[str] = None,
    limit: int = 100,
    mgr: AgentWalletManager = Depends(get_manager),
):
    """Get audit log entries."""
    events = mgr.get_audit_log(agent_id=agent_id, limit=limit)
    return {"events": events}


# ─────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
