"""
AgentWallet - Kalshi Integration
Financial infrastructure for AI agents with spend controls, rules engine, and audit logging.

Reference: arXiv:2501.10114 "Infrastructure for AI Agents"
"""

import os
import json
import time
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from functools import wraps

from kalshi_client import KalshiClient


# ─────────────────────────────────────────────────────────────────
# Enums & Data Classes
# ─────────────────────────────────────────────────────────────────

class ActionType(Enum):
    GET_BALANCE = "get_balance"
    GET_POSITIONS = "get_positions"
    GET_MARKETS = "get_markets"
    GET_ORDERBOOK = "get_orderbook"
    CREATE_ORDER = "create_order"
    CANCEL_ORDER = "cancel_order"
    BATCH_CANCEL = "batch_cancel"


class RuleResult(Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


class AuditEventType(Enum):
    ACTION_REQUESTED = "action_requested"
    ACTION_ALLOWED = "action_allowed"
    ACTION_DENIED = "action_denied"
    ACTION_EXECUTED = "action_executed"
    ACTION_FAILED = "action_failed"
    RULE_TRIGGERED = "rule_triggered"
    KILL_SWITCH_ACTIVATED = "kill_switch_activated"
    KILL_SWITCH_DEACTIVATED = "kill_switch_deactivated"


@dataclass
class Agent:
    """An AI agent with wallet access."""
    agent_id: str
    name: str
    description: str = ""
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)
    is_active: bool = True


@dataclass
class SpendLimit:
    """Spend limit configuration."""
    max_per_order: int  # cents
    max_per_day: int  # cents
    max_per_week: int  # cents
    max_position_size: int  # contracts
    allowed_tickers: Optional[List[str]] = None  # None = all allowed
    blocked_tickers: List[str] = field(default_factory=list)


@dataclass
class Rule:
    """A rule in the rules engine."""
    rule_id: str
    name: str
    description: str
    condition: Callable[[Dict[str, Any]], bool]
    action: RuleResult
    priority: int = 0  # Higher = evaluated first
    is_active: bool = True


@dataclass
class AuditEvent:
    """An audit log entry."""
    event_id: str
    timestamp: str
    agent_id: str
    event_type: AuditEventType
    action_type: Optional[ActionType]
    request_data: Dict[str, Any]
    response_data: Optional[Dict[str, Any]] = None
    rule_id: Optional[str] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────
# Audit Logger
# ─────────────────────────────────────────────────────────────────

class AuditLogger:
    """
    Immutable audit log for all agent actions.
    In production, this would write to a database or append-only log.
    """
    
    def __init__(self, log_file: Optional[str] = None):
        self.log_file = log_file or "agent_wallet_audit.jsonl"
        self.events: List[AuditEvent] = []
    
    def log(self, event: AuditEvent) -> None:
        """Log an audit event."""
        self.events.append(event)
        
        # Append to file (append-only for immutability)
        with open(self.log_file, "a") as f:
            f.write(json.dumps(asdict(event), default=str) + "\n")
    
    def create_event(
        self,
        agent_id: str,
        event_type: AuditEventType,
        action_type: Optional[ActionType],
        request_data: Dict[str, Any],
        response_data: Optional[Dict[str, Any]] = None,
        rule_id: Optional[str] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditEvent:
        """Create and log an audit event."""
        event = AuditEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow().isoformat(),
            agent_id=agent_id,
            event_type=event_type,
            action_type=action_type,
            request_data=request_data,
            response_data=response_data,
            rule_id=rule_id,
            error=error,
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    def get_events(
        self,
        agent_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        since: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
        """Query audit events."""
        filtered = self.events
        
        if agent_id:
            filtered = [e for e in filtered if e.agent_id == agent_id]
        if event_type:
            filtered = [e for e in filtered if e.event_type == event_type]
        if since:
            filtered = [e for e in filtered if datetime.fromisoformat(e.timestamp) >= since]
        
        return filtered[-limit:]


# ─────────────────────────────────────────────────────────────────
# Rules Engine
# ─────────────────────────────────────────────────────────────────

class RulesEngine:
    """
    Evaluates rules to determine if an action should be allowed.
    Rules are evaluated in priority order (highest first).
    """
    
    def __init__(self):
        self.rules: Dict[str, Rule] = {}
    
    def add_rule(self, rule: Rule) -> None:
        """Add a rule to the engine."""
        self.rules[rule.rule_id] = rule
    
    def remove_rule(self, rule_id: str) -> None:
        """Remove a rule."""
        self.rules.pop(rule_id, None)
    
    def evaluate(
        self,
        context: Dict[str, Any],
        audit_logger: Optional[AuditLogger] = None,
        agent_id: Optional[str] = None,
    ) -> tuple[RuleResult, Optional[str]]:
        """
        Evaluate all rules against the context.
        Returns (result, triggered_rule_id).
        """
        # Sort by priority (highest first)
        sorted_rules = sorted(
            [r for r in self.rules.values() if r.is_active],
            key=lambda r: r.priority,
            reverse=True,
        )
        
        for rule in sorted_rules:
            try:
                if rule.condition(context):
                    if audit_logger and agent_id:
                        audit_logger.create_event(
                            agent_id=agent_id,
                            event_type=AuditEventType.RULE_TRIGGERED,
                            action_type=context.get("action_type"),
                            request_data=context,
                            rule_id=rule.rule_id,
                            metadata={"rule_name": rule.name, "result": rule.action.value},
                        )
                    return rule.action, rule.rule_id
            except Exception as e:
                # Rule evaluation failed - log but continue
                print(f"Rule {rule.rule_id} evaluation failed: {e}")
                continue
        
        # No rules triggered - default allow
        return RuleResult.ALLOW, None


# ─────────────────────────────────────────────────────────────────
# Spend Tracker
# ─────────────────────────────────────────────────────────────────

class SpendTracker:
    """Tracks agent spending for limit enforcement."""
    
    def __init__(self):
        # agent_id -> list of (timestamp, amount_cents)
        self.transactions: Dict[str, List[tuple[datetime, int]]] = {}
    
    def record_spend(self, agent_id: str, amount_cents: int) -> None:
        """Record a spend transaction."""
        if agent_id not in self.transactions:
            self.transactions[agent_id] = []
        self.transactions[agent_id].append((datetime.utcnow(), amount_cents))
    
    def get_spend(self, agent_id: str, since: datetime) -> int:
        """Get total spend since a given time."""
        if agent_id not in self.transactions:
            return 0
        
        return sum(
            amount for ts, amount in self.transactions[agent_id]
            if ts >= since
        )
    
    def get_daily_spend(self, agent_id: str) -> int:
        """Get spend in the last 24 hours."""
        return self.get_spend(agent_id, datetime.utcnow() - timedelta(days=1))
    
    def get_weekly_spend(self, agent_id: str) -> int:
        """Get spend in the last 7 days."""
        return self.get_spend(agent_id, datetime.utcnow() - timedelta(days=7))


# ─────────────────────────────────────────────────────────────────
# Agent Wallet
# ─────────────────────────────────────────────────────────────────

class AgentWallet:
    """
    A wallet for an AI agent with spend controls and rules.
    This is the main interface for agent trading.
    """
    
    def __init__(
        self,
        agent: Agent,
        kalshi_client: KalshiClient,
        spend_limit: SpendLimit,
        rules_engine: RulesEngine,
        audit_logger: AuditLogger,
        spend_tracker: SpendTracker,
    ):
        self.agent = agent
        self.client = kalshi_client
        self.spend_limit = spend_limit
        self.rules_engine = rules_engine
        self.audit_logger = audit_logger
        self.spend_tracker = spend_tracker
        self._kill_switch_active = False
    
    # ─────────────────────────────────────────────────────────────
    # Kill Switch
    # ─────────────────────────────────────────────────────────────
    
    def activate_kill_switch(self, reason: str = "") -> Dict[str, Any]:
        """
        Activate kill switch - cancels all orders and blocks new actions.
        """
        self._kill_switch_active = True
        
        self.audit_logger.create_event(
            agent_id=self.agent.agent_id,
            event_type=AuditEventType.KILL_SWITCH_ACTIVATED,
            action_type=None,
            request_data={"reason": reason},
        )
        
        # Cancel all resting orders
        try:
            result = self.client.batch_cancel_orders()
            return {"status": "kill_switch_activated", "orders_cancelled": result}
        except Exception as e:
            return {"status": "kill_switch_activated", "cancel_error": str(e)}
    
    def deactivate_kill_switch(self) -> None:
        """Deactivate kill switch."""
        self._kill_switch_active = False
        
        self.audit_logger.create_event(
            agent_id=self.agent.agent_id,
            event_type=AuditEventType.KILL_SWITCH_DEACTIVATED,
            action_type=None,
            request_data={},
        )
    
    @property
    def is_kill_switch_active(self) -> bool:
        return self._kill_switch_active
    
    # ─────────────────────────────────────────────────────────────
    # Internal: Action Execution with Controls
    # ─────────────────────────────────────────────────────────────
    
    def _check_controls(
        self,
        action_type: ActionType,
        request_data: Dict[str, Any],
    ) -> tuple[bool, Optional[str]]:
        """
        Check all controls before executing an action.
        Returns (allowed, denial_reason).
        """
        # Kill switch check
        if self._kill_switch_active:
            return False, "Kill switch is active"
        
        # Agent active check
        if not self.agent.is_active:
            return False, "Agent is deactivated"
        
        # Build context for rules engine
        context = {
            "action_type": action_type,
            "request_data": request_data,
            "agent": self.agent,
            "spend_limit": self.spend_limit,
            "daily_spend": self.spend_tracker.get_daily_spend(self.agent.agent_id),
            "weekly_spend": self.spend_tracker.get_weekly_spend(self.agent.agent_id),
        }
        
        # For orders, add additional context
        if action_type == ActionType.CREATE_ORDER:
            ticker = request_data.get("ticker", "")
            price = request_data.get("yes_price") or request_data.get("no_price") or 0
            count = request_data.get("count", 0)
            order_value = price * count
            
            context.update({
                "ticker": ticker,
                "order_value": order_value,
                "count": count,
            })
            
            # Spend limit checks
            if order_value > self.spend_limit.max_per_order:
                return False, f"Order value {order_value} exceeds max_per_order {self.spend_limit.max_per_order}"
            
            if context["daily_spend"] + order_value > self.spend_limit.max_per_day:
                return False, f"Would exceed daily spend limit of {self.spend_limit.max_per_day}"
            
            if context["weekly_spend"] + order_value > self.spend_limit.max_per_week:
                return False, f"Would exceed weekly spend limit of {self.spend_limit.max_per_week}"
            
            if count > self.spend_limit.max_position_size:
                return False, f"Position size {count} exceeds max {self.spend_limit.max_position_size}"
            
            # Ticker restrictions
            if self.spend_limit.allowed_tickers and ticker not in self.spend_limit.allowed_tickers:
                return False, f"Ticker {ticker} not in allowed list"
            
            if ticker in self.spend_limit.blocked_tickers:
                return False, f"Ticker {ticker} is blocked"
        
        # Rules engine evaluation
        rule_result, rule_id = self.rules_engine.evaluate(
            context,
            self.audit_logger,
            self.agent.agent_id,
        )
        
        if rule_result == RuleResult.DENY:
            return False, f"Denied by rule: {rule_id}"
        
        if rule_result == RuleResult.REQUIRE_APPROVAL:
            return False, f"Requires approval (rule: {rule_id})"
        
        return True, None
    
    def _execute_action(
        self,
        action_type: ActionType,
        request_data: Dict[str, Any],
        action_fn: Callable[[], Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Execute an action with full audit trail."""
        
        # Log request
        self.audit_logger.create_event(
            agent_id=self.agent.agent_id,
            event_type=AuditEventType.ACTION_REQUESTED,
            action_type=action_type,
            request_data=request_data,
        )
        
        # Check controls
        allowed, denial_reason = self._check_controls(action_type, request_data)
        
        if not allowed:
            self.audit_logger.create_event(
                agent_id=self.agent.agent_id,
                event_type=AuditEventType.ACTION_DENIED,
                action_type=action_type,
                request_data=request_data,
                error=denial_reason,
            )
            raise PermissionError(denial_reason)
        
        # Log allowed
        self.audit_logger.create_event(
            agent_id=self.agent.agent_id,
            event_type=AuditEventType.ACTION_ALLOWED,
            action_type=action_type,
            request_data=request_data,
        )
        
        # Execute
        try:
            result = action_fn()
            
            # Track spend for orders
            if action_type == ActionType.CREATE_ORDER:
                price = request_data.get("yes_price") or request_data.get("no_price") or 0
                count = request_data.get("count", 0)
                self.spend_tracker.record_spend(self.agent.agent_id, price * count)
            
            # Log success
            self.audit_logger.create_event(
                agent_id=self.agent.agent_id,
                event_type=AuditEventType.ACTION_EXECUTED,
                action_type=action_type,
                request_data=request_data,
                response_data=result,
            )
            
            return result
            
        except Exception as e:
            self.audit_logger.create_event(
                agent_id=self.agent.agent_id,
                event_type=AuditEventType.ACTION_FAILED,
                action_type=action_type,
                request_data=request_data,
                error=str(e),
            )
            raise
    
    # ─────────────────────────────────────────────────────────────
    # Public API: Read Operations
    # ─────────────────────────────────────────────────────────────
    
    def get_balance(self) -> Dict[str, Any]:
        """Get account balance."""
        return self._execute_action(
            ActionType.GET_BALANCE,
            {},
            lambda: self.client.get_balance(),
        )
    
    def get_positions(self, limit: int = 100) -> Dict[str, Any]:
        """Get current positions."""
        return self._execute_action(
            ActionType.GET_POSITIONS,
            {"limit": limit},
            lambda: self.client.get_positions(limit=limit),
        )
    
    def get_markets(
        self,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Get markets."""
        return self._execute_action(
            ActionType.GET_MARKETS,
            {"status": status, "limit": limit},
            lambda: self.client.get_markets(status=status, limit=limit),
        )
    
    def get_orderbook(self, ticker: str, depth: int = 10) -> Dict[str, Any]:
        """Get orderbook for a market."""
        return self._execute_action(
            ActionType.GET_ORDERBOOK,
            {"ticker": ticker, "depth": depth},
            lambda: self.client.get_orderbook(ticker=ticker, depth=depth),
        )
    
    # ─────────────────────────────────────────────────────────────
    # Public API: Write Operations
    # ─────────────────────────────────────────────────────────────
    
    def create_order(
        self,
        ticker: str,
        side: str,
        action: str,
        count: int,
        type: str = "limit",
        yes_price: Optional[int] = None,
        no_price: Optional[int] = None,
        client_order_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create an order with spend controls.
        
        Args:
            ticker: Market ticker
            side: "yes" or "no"
            action: "buy" or "sell"
            count: Number of contracts
            type: "limit" or "market"
            yes_price: Limit price in cents (1-99)
            no_price: Limit price in cents (1-99)
        """
        request_data = {
            "ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "type": type,
            "yes_price": yes_price,
            "no_price": no_price,
        }
        
        return self._execute_action(
            ActionType.CREATE_ORDER,
            request_data,
            lambda: self.client.create_order(
                ticker=ticker,
                side=side,
                action=action,
                count=count,
                type=type,
                yes_price=yes_price,
                no_price=no_price,
                client_order_id=client_order_id,
            ),
        )
    
    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an order."""
        return self._execute_action(
            ActionType.CANCEL_ORDER,
            {"order_id": order_id},
            lambda: self.client.cancel_order(order_id),
        )
    
    def cancel_all_orders(self, ticker: Optional[str] = None) -> Dict[str, Any]:
        """Cancel all resting orders."""
        return self._execute_action(
            ActionType.BATCH_CANCEL,
            {"ticker": ticker},
            lambda: self.client.batch_cancel_orders(ticker=ticker),
        )


# ─────────────────────────────────────────────────────────────────
# Agent Wallet Manager
# ─────────────────────────────────────────────────────────────────

class AgentWalletManager:
    """
    Manages multiple agent wallets.
    This is the top-level interface for the AgentWallet system.
    """
    
    def __init__(
        self,
        kalshi_api_key_id: str,
        kalshi_private_key_path: str,
        audit_log_file: str = "agent_wallet_audit.jsonl",
    ):
        self.kalshi_client = KalshiClient(
            api_key_id=kalshi_api_key_id,
            private_key_path=kalshi_private_key_path,
        )
        self.audit_logger = AuditLogger(audit_log_file)
        self.rules_engine = RulesEngine()
        self.spend_tracker = SpendTracker()
        
        self.agents: Dict[str, Agent] = {}
        self.wallets: Dict[str, AgentWallet] = {}
        
        # Add default rules
        self._setup_default_rules()
    
    def _setup_default_rules(self) -> None:
        """Set up default safety rules."""
        
        # Block very large orders
        self.rules_engine.add_rule(Rule(
            rule_id="default_max_order_value",
            name="Maximum Order Value",
            description="Block orders over $100",
            condition=lambda ctx: ctx.get("order_value", 0) > 10000,  # 100 dollars in cents
            action=RuleResult.DENY,
            priority=100,
        ))
        
        # Require approval for orders over $50
        self.rules_engine.add_rule(Rule(
            rule_id="default_approval_threshold",
            name="Approval Threshold",
            description="Require approval for orders over $50",
            condition=lambda ctx: ctx.get("order_value", 0) > 5000,
            action=RuleResult.REQUIRE_APPROVAL,
            priority=50,
        ))
    
    def create_agent(
        self,
        name: str,
        description: str = "",
        spend_limit: Optional[SpendLimit] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Agent:
        """Create a new agent."""
        agent = Agent(
            agent_id=str(uuid.uuid4()),
            name=name,
            description=description,
            metadata=metadata or {},
        )
        self.agents[agent.agent_id] = agent
        
        # Create wallet with default or provided spend limits
        if spend_limit is None:
            spend_limit = SpendLimit(
                max_per_order=5000,      # $50
                max_per_day=20000,       # $200
                max_per_week=50000,      # $500
                max_position_size=100,   # 100 contracts
            )
        
        wallet = AgentWallet(
            agent=agent,
            kalshi_client=self.kalshi_client,
            spend_limit=spend_limit,
            rules_engine=self.rules_engine,
            audit_logger=self.audit_logger,
            spend_tracker=self.spend_tracker,
        )
        self.wallets[agent.agent_id] = wallet
        
        return agent
    
    def get_wallet(self, agent_id: str) -> AgentWallet:
        """Get an agent's wallet."""
        if agent_id not in self.wallets:
            raise ValueError(f"No wallet for agent {agent_id}")
        return self.wallets[agent_id]
    
    def deactivate_agent(self, agent_id: str) -> None:
        """Deactivate an agent."""
        if agent_id in self.agents:
            self.agents[agent_id].is_active = False
    
    def activate_agent(self, agent_id: str) -> None:
        """Reactivate an agent."""
        if agent_id in self.agents:
            self.agents[agent_id].is_active = True
    
    def global_kill_switch(self, reason: str = "") -> Dict[str, Any]:
        """Activate kill switch for ALL agents."""
        results = {}
        for agent_id, wallet in self.wallets.items():
            results[agent_id] = wallet.activate_kill_switch(reason)
        return results
    
    def add_rule(self, rule: Rule) -> None:
        """Add a global rule."""
        self.rules_engine.add_rule(rule)
    
    def get_audit_log(
        self,
        agent_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get audit log entries."""
        events = self.audit_logger.get_events(agent_id=agent_id, limit=limit)
        return [asdict(e) for e in events]


# ─────────────────────────────────────────────────────────────────
# Factory Function
# ─────────────────────────────────────────────────────────────────

def create_manager_from_env() -> AgentWalletManager:
    """Create manager from environment variables."""
    return AgentWalletManager(
        kalshi_api_key_id=os.environ["KALSHI_API_KEY_ID"],
        kalshi_private_key_path=os.environ.get("KALSHI_PRIVATE_KEY_PATH", "~/.kalshi/private_key.pem"),
    )


# ─────────────────────────────────────────────────────────────────
# Example Usage
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Initialize manager
    manager = AgentWalletManager(
        kalshi_api_key_id=os.environ.get("KALSHI_API_KEY_ID", "Ce00cf3a-1002-4eab-aa9c-b69560921052"),
        kalshi_private_key_path="~/.kalshi/private_key.pem",
    )
    
    # Create an agent with custom spend limits
    agent = manager.create_agent(
        name="trading-bot-alpha",
        description="Prediction market trading agent",
        spend_limit=SpendLimit(
            max_per_order=2500,      # $25
            max_per_day=10000,       # $100
            max_per_week=25000,      # $250
            max_position_size=50,
            blocked_tickers=["BLOCKED-TICKER"],
        ),
    )
    print(f"Created agent: {agent.agent_id}")
    
    # Get the agent's wallet
    wallet = manager.get_wallet(agent.agent_id)
    
    # Check balance (goes through controls + audit)
    try:
        balance = wallet.get_balance()
        print(f"Balance: ${balance['balance'] / 100:.2f}")
    except PermissionError as e:
        print(f"Denied: {e}")
    
    # Try to get positions
    try:
        positions = wallet.get_positions()
        print(f"Positions: {len(positions.get('positions', []))}")
    except PermissionError as e:
        print(f"Denied: {e}")
    
    # Add a custom rule
    manager.add_rule(Rule(
        rule_id="no_weekend_trading",
        name="No Weekend Trading",
        description="Block trading on weekends",
        condition=lambda ctx: datetime.utcnow().weekday() >= 5,
        action=RuleResult.DENY,
        priority=200,
    ))
    
    # View audit log
    print("\n--- Audit Log ---")
    for event in manager.get_audit_log(limit=5):
        print(f"[{event['timestamp']}] {event['event_type']} - {event['action_type']}")
    
    print("\nAgentWallet ready!")
