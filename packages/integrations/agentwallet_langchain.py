"""
AgentWallet x LangChain Integration

Drop-in governance for any LangChain agent.
Every tool call that involves spending money flows through
AgentWallet's rules engine before execution.

Usage:
    from agentwallet_langchain import AgentWalletToolkit

    toolkit = AgentWalletToolkit(
        api_url="https://your-api.run.app",
        api_key="your-owner-key",
        wallet_id="your-wallet-id",
    )

    agent = initialize_agent(
        tools=toolkit.get_tools(),
        llm=ChatOpenAI(),
        agent=AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    )
"""

import json
import requests
from typing import Optional, Type
from langchain.tools import BaseTool
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
# authorize_spend tool
# ─────────────────────────────────────────────────────────

class AuthorizeSpendInput(BaseModel):
    amount: float = Field(description="Amount in USD to spend")
    category: Optional[str] = Field(None, description="Spend category e.g. 'llm-inference'")
    description: Optional[str] = Field(None, description="What this payment is for")
    recipient_id: Optional[str] = Field(None, description="Recipient identifier")


class AuthorizeSpendTool(BaseTool):
    name: str = "authorize_spend"
    description: str = (
        "Request authorization to spend money. "
        "ALWAYS call this before making any payment or API call that costs money. "
        "Returns approved/rejected status and which governance rules fired."
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
                return f"✅ APPROVED — ${amount} spend authorized. Tx ID: {tx.get('id')}"
            elif status == "REJECTED":
                failed = [r["reason"] for r in eval_.get("results", []) if not r.get("passed")]
                return f"⛔ REJECTED — {'; '.join(failed) or 'governance rule blocked this spend'}"
            elif status == "AWAITING_APPROVAL":
                return f"⚠️ PENDING HUMAN APPROVAL — Tx ID: {tx.get('id')}"
            return f"Status: {status}"
        except requests.HTTPError as e:
            return f"⛔ BLOCKED — {e.response.json().get('error', str(e))}"

    async def _arun(self, *args, **kwargs):
        raise NotImplementedError("Use sync version")


# ─────────────────────────────────────────────────────────
# get_wallet_balance tool
# ─────────────────────────────────────────────────────────

class GetWalletBalanceTool(BaseTool):
    name: str = "get_wallet_balance"
    description: str = "Check the current wallet balance and governance status before spending."
    client: AgentWalletClient = None
    wallet_id: str = None

    def _run(self, *args, **kwargs) -> str:
        result = self.client.get(f"/api/wallets/{self.wallet_id}/balance")
        return (
            f"Balance: ${float(result['balance']):.2f} {result['currency']} | "
            f"Status: {result['status']}"
        )

    async def _arun(self, *args, **kwargs):
        raise NotImplementedError


# ─────────────────────────────────────────────────────────
# Toolkit
# ─────────────────────────────────────────────────────────

class AgentWalletToolkit:
    """
    Drop AgentWallet governance into any LangChain agent in 3 lines.

        toolkit = AgentWalletToolkit(api_url=..., api_key=..., wallet_id=...)
        tools = toolkit.get_tools()
        agent = initialize_agent(tools=tools, llm=llm, ...)
    """

    def __init__(self, api_url: str, api_key: str, wallet_id: str):
        self.client = AgentWalletClient(api_url, api_key)
        self.wallet_id = wallet_id

    def get_tools(self):
        return [
            AuthorizeSpendTool(client=self.client, wallet_id=self.wallet_id),
            GetWalletBalanceTool(client=self.client, wallet_id=self.wallet_id),
        ]
