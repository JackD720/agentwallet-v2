"""
AgentWallet x CrewAI Integration

Govern every financial action your CrewAI agents take.
Wire in spend controls, kill switches, and audit trails
without changing your agent logic.

Usage:
    from agentwallet_crewai import AgentWalletTools

    tools = AgentWalletTools(
        api_url="https://your-api.run.app",
        api_key="your-owner-key",
        wallet_id="your-wallet-id",
    )

    financial_agent = Agent(
        role="Financial Operator",
        goal="Execute payments within governance limits",
        tools=tools.get_tools(),
    )
"""

import requests
from typing import Optional, Type
from crewai.tools import BaseTool
from pydantic import BaseModel, Field


class AgentWalletClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    def post(self, path: str, body: dict) -> dict:
        r = requests.post(f"{self.api_url}{path}", json=body, headers=self.headers)
        r.raise_for_status()
        return r.json()

    def get(self, path: str) -> dict:
        r = requests.get(f"{self.api_url}{path}", headers=self.headers)
        r.raise_for_status()
        return r.json()


# ─────────────────────────────────────────────────────────
# authorize_spend
# ─────────────────────────────────────────────────────────

class AuthorizeSpendInput(BaseModel):
    amount: float = Field(description="Amount in USD to spend")
    category: Optional[str] = Field(None, description="Spend category e.g. 'api-call', 'trading'")
    description: Optional[str] = Field(None, description="What this payment is for")
    recipient_id: Optional[str] = Field(None, description="Recipient identifier for whitelist rules")


class AuthorizeSpendTool(BaseTool):
    name: str = "authorize_spend"
    description: str = (
        "Authorize a financial transaction through AgentWallet governance. "
        "Call this BEFORE spending any money. "
        "The governance engine evaluates spend limits, category rules, and kill switches. "
        "Returns APPROVED, REJECTED, or PENDING APPROVAL."
    )
    args_schema: Type[BaseModel] = AuthorizeSpendInput
    client: AgentWalletClient = None
    wallet_id: str = None

    def _run(self, amount: float, category: str = None, description: str = None, recipient_id: str = None) -> str:
        payload = {"walletId": self.wallet_id, "amount": amount}
        if category: payload["category"] = category
        if description: payload["description"] = description
        if recipient_id: payload["recipientId"] = recipient_id

        try:
            result = self.client.post("/api/transactions", payload)
            tx = result.get("transaction", {})
            eval_ = result.get("ruleEvaluation", {})
            status = tx.get("status", "UNKNOWN")

            if status == "COMPLETED":
                return f"✅ APPROVED — ${amount:.2f} authorized. Transaction ID: {tx.get('id')}"
            elif status == "REJECTED":
                if eval_.get("killSwitched"):
                    return "⛔ KILL SWITCH ACTIVE — all transactions are blocked. Human intervention required."
                failed = [r["reason"] for r in eval_.get("results", []) if not r.get("passed")]
                return f"⛔ REJECTED — {'; '.join(failed)}"
            elif status == "AWAITING_APPROVAL":
                return f"⚠️ AWAITING HUMAN APPROVAL — Transaction ID: {tx.get('id')}. A human must approve this before funds move."
            return f"Status: {status}"

        except requests.HTTPError as e:
            try:
                err = e.response.json().get("error", str(e))
            except Exception:
                err = str(e)
            return f"⛔ GOVERNANCE BLOCK — {err}"


# ─────────────────────────────────────────────────────────
# check_wallet
# ─────────────────────────────────────────────────────────

class CheckWalletTool(BaseTool):
    name: str = "check_wallet"
    description: str = (
        "Check the current wallet balance, active governance rules, and kill switch status. "
        "Use this before planning any spending to understand available budget and restrictions."
    )
    client: AgentWalletClient = None
    wallet_id: str = None

    def _run(self, *args, **kwargs) -> str:
        try:
            result = self.client.get(f"/api/wallets/{self.wallet_id}")
            w = result["wallet"]
            rules = w.get("activeRules", [])
            lines = [
                f"Balance: ${float(w['balance']):.2f} {w['currency']}",
                f"Status: {w['status']}",
                f"Active rules ({len(rules)}):",
            ]
            for r in rules:
                lines.append(f"  [{r['ruleType']}] {r['parameters']}")
            return "\n".join(lines)
        except Exception as e:
            return f"Error checking wallet: {e}"


# ─────────────────────────────────────────────────────────
# emergency_stop
# ─────────────────────────────────────────────────────────

class EmergencyStopInput(BaseModel):
    reason: str = Field(description="Why you are triggering an emergency stop")


class EmergencyStopTool(BaseTool):
    name: str = "emergency_stop"
    description: str = (
        "Immediately freeze the wallet and halt all agent spending. "
        "Use this if you detect anomalous behavior, unexpected charges, or any safety concern. "
        "This is reversible — a human can reset it."
    )
    args_schema: Type[BaseModel] = EmergencyStopInput
    client: AgentWalletClient = None
    wallet_id: str = None

    def _run(self, reason: str) -> str:
        try:
            result = self.client.post(f"/api/killswitch/emergency/{self.wallet_id}", {"reason": reason})
            return f"⛔ EMERGENCY STOP ACTIVATED — Wallet frozen. Reason: {reason}"
        except Exception as e:
            return f"Error triggering emergency stop: {e}"


# ─────────────────────────────────────────────────────────
# AgentWalletTools
# ─────────────────────────────────────────────────────────

class AgentWalletTools:
    """
    Wire AgentWallet governance into CrewAI in 3 lines.

        tools = AgentWalletTools(api_url=..., api_key=..., wallet_id=...)
        agent = Agent(role="...", tools=tools.get_tools())
    """

    def __init__(self, api_url: str, api_key: str, wallet_id: str):
        self.client = AgentWalletClient(api_url, api_key)
        self.wallet_id = wallet_id

    def get_tools(self):
        return [
            AuthorizeSpendTool(client=self.client, wallet_id=self.wallet_id),
            CheckWalletTool(client=self.client, wallet_id=self.wallet_id),
            EmergencyStopTool(client=self.client, wallet_id=self.wallet_id),
        ]
