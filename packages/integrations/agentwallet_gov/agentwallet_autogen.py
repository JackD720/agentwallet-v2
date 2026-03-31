"""
AgentWallet x AutoGen Integration

Governance middleware for Microsoft AutoGen agents.
Register AgentWallet tools with any AutoGen AssistantAgent
so every financial action flows through the rules engine.

Usage:
    from agentwallet_autogen import register_agentwallet_tools

    assistant = AssistantAgent("financial_agent", llm_config=llm_config)
    user_proxy = UserProxyAgent("user", human_input_mode="NEVER")

    register_agentwallet_tools(
        agent=assistant,
        executor=user_proxy,
        api_url="https://your-api.run.app",
        api_key="your-owner-key",
        wallet_id="your-wallet-id",
    )
"""

import json
import requests
from typing import Annotated, Optional


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


def register_agentwallet_tools(
    agent,
    executor,
    api_url: str,
    api_key: str,
    wallet_id: str,
) -> None:
    """
    Register AgentWallet governance tools with an AutoGen agent pair.

    Args:
        agent: The AssistantAgent that will use the tools
        executor: The UserProxyAgent that will execute the tools
        api_url: AgentWallet API URL
        api_key: Your owner API key
        wallet_id: The wallet to govern
    """
    from autogen import register_function

    client = AgentWalletClient(api_url, api_key)

    # ── authorize_spend ──────────────────────────────────
    def authorize_spend(
        amount: Annotated[float, "Amount in USD to spend"],
        category: Annotated[Optional[str], "Spend category e.g. 'api-call', 'trading'"] = None,
        description: Annotated[Optional[str], "What this payment is for"] = None,
        recipient_id: Annotated[Optional[str], "Recipient identifier"] = None,
    ) -> str:
        payload = {"walletId": wallet_id, "amount": amount}
        if category: payload["category"] = category
        if description: payload["description"] = description
        if recipient_id: payload["recipientId"] = recipient_id

        try:
            result = client.post("/api/transactions", payload)
            tx = result.get("transaction", {})
            eval_ = result.get("ruleEvaluation", {})
            status = tx.get("status", "UNKNOWN")

            if status == "COMPLETED":
                return f"APPROVED — ${amount:.2f} authorized. Tx ID: {tx.get('id')}"
            elif status == "REJECTED":
                if eval_.get("killSwitched"):
                    return "KILL SWITCH ACTIVE — all transactions blocked."
                failed = [r["reason"] for r in eval_.get("results", []) if not r.get("passed")]
                return f"REJECTED — {'; '.join(failed)}"
            elif status == "AWAITING_APPROVAL":
                return f"AWAITING HUMAN APPROVAL — Tx ID: {tx.get('id')}"
            return f"Status: {status}"

        except requests.HTTPError as e:
            try:
                err = e.response.json().get("error", str(e))
            except Exception:
                err = str(e)
            return f"GOVERNANCE BLOCK — {err}"

    register_function(
        authorize_spend,
        caller=agent,
        executor=executor,
        name="authorize_spend",
        description=(
            "Authorize a financial transaction through AgentWallet governance. "
            "ALWAYS call this before spending money. "
            "Returns APPROVED, REJECTED, or AWAITING HUMAN APPROVAL."
        ),
    )

    # ── check_wallet ─────────────────────────────────────
    def check_wallet() -> str:
        try:
            result = client.get(f"/api/wallets/{wallet_id}")
            w = result["wallet"]
            rules = w.get("activeRules", [])
            lines = [
                f"Balance: ${float(w['balance']):.2f} {w['currency']}",
                f"Status: {w['status']}",
                f"Active rules: {len(rules)}",
            ]
            for r in rules:
                lines.append(f"  [{r['ruleType']}] {r['parameters']}")
            return "\n".join(lines)
        except Exception as e:
            return f"Error: {e}"

    register_function(
        check_wallet,
        caller=agent,
        executor=executor,
        name="check_wallet",
        description="Check wallet balance, governance rules, and kill switch status before spending.",
    )

    # ── emergency_stop ────────────────────────────────────
    def emergency_stop(
        reason: Annotated[str, "Why you are triggering an emergency stop"],
    ) -> str:
        try:
            client.post(f"/api/killswitch/emergency/{wallet_id}", {"reason": reason})
            return f"EMERGENCY STOP ACTIVATED — Wallet frozen. Reason: {reason}"
        except Exception as e:
            return f"Error: {e}"

    register_function(
        emergency_stop,
        caller=agent,
        executor=executor,
        name="emergency_stop",
        description="Immediately freeze the wallet and halt all spending. Use if something looks wrong.",
    )
