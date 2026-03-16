"""
Kalshi API Client with RSA-PSS Authentication
Works with api.elections.kalshi.com
"""

import requests
import datetime
import base64
import os
from typing import Optional, Dict, Any, List
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import padding


class KalshiClient:
    """
    Kalshi API client with RSA-PSS authentication.
    
    Usage:
        client = KalshiClient(
            api_key_id="your-api-key-id",
            private_key_path="~/.kalshi/private_key.pem"
        )
        balance = client.get_balance()
        print(f"Balance: ${balance['balance'] / 100:.2f}")
    """
    
    def __init__(
        self,
        api_key_id: str,
        private_key_path: Optional[str] = None,
        private_key_pem: Optional[str] = None,
        base_url: str = "https://api.elections.kalshi.com"
    ):
        self.api_key_id = api_key_id
        self.base_url = base_url
        
        # Load private key
        if private_key_pem:
            key_data = private_key_pem.encode() if isinstance(private_key_pem, str) else private_key_pem
        elif private_key_path:
            path = os.path.expanduser(private_key_path)
            with open(path, "rb") as f:
                key_data = f.read()
        else:
            raise ValueError("Must provide either private_key_path or private_key_pem")
        
        self.private_key = serialization.load_pem_private_key(
            key_data, password=None, backend=default_backend()
        )
    
    def _sign(self, timestamp: str, method: str, path: str) -> str:
        """Generate RSA-PSS signature for request."""
        # Strip query params for signing
        path_without_query = path.split("?")[0]
        message = f"{timestamp}{method}{path_without_query}".encode("utf-8")
        
        signature = self.private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH
            ),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode("utf-8")
    
    def _headers(self, method: str, path: str) -> Dict[str, str]:
        """Generate authenticated headers."""
        timestamp = str(int(datetime.datetime.now().timestamp() * 1000))
        signature = self._sign(timestamp, method, path)
        
        return {
            "KALSHI-ACCESS-KEY": self.api_key_id,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            "Content-Type": "application/json",
        }
    
    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make authenticated request."""
        url = self.base_url + path
        headers = self._headers(method, path)
        
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json
        )
        response.raise_for_status()
        return response.json()
    
    # ─────────────────────────────────────────────────────────────
    # Portfolio
    # ─────────────────────────────────────────────────────────────
    
    def get_balance(self) -> Dict[str, Any]:
        """Get account balance."""
        return self._request("GET", "/trade-api/v2/portfolio/balance")
    
    def get_positions(self, limit: int = 100, cursor: Optional[str] = None) -> Dict[str, Any]:
        """Get current positions."""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return self._request("GET", "/trade-api/v2/portfolio/positions", params=params)
    
    def get_portfolio_settlements(self, limit: int = 100, cursor: Optional[str] = None) -> Dict[str, Any]:
        """Get portfolio settlement history."""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return self._request("GET", "/trade-api/v2/portfolio/settlements", params=params)
    
    # ─────────────────────────────────────────────────────────────
    # Orders
    # ─────────────────────────────────────────────────────────────
    
    def get_orders(
        self,
        status: Optional[str] = None,
        ticker: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get orders. Status can be 'resting', 'canceled', 'executed'."""
        params = {"limit": limit}
        if status:
            params["status"] = status
        if ticker:
            params["ticker"] = ticker
        if cursor:
            params["cursor"] = cursor
        return self._request("GET", "/trade-api/v2/portfolio/orders", params=params)
    
    def create_order(
        self,
        ticker: str,
        side: str,  # "yes" or "no"
        action: str,  # "buy" or "sell"
        count: int,
        type: str = "limit",  # "limit" or "market"
        yes_price: Optional[int] = None,  # price in cents (1-99)
        no_price: Optional[int] = None,
        client_order_id: Optional[str] = None,
        expiration_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create an order.
        
        Args:
            ticker: Market ticker (e.g., "KXBTC-24DEC31-T50000")
            side: "yes" or "no"
            action: "buy" or "sell"
            count: Number of contracts
            type: "limit" or "market"
            yes_price: Limit price in cents for yes contracts (1-99)
            no_price: Limit price in cents for no contracts (1-99)
            client_order_id: Optional client-specified order ID
            expiration_ts: Optional expiration timestamp in seconds
        """
        order = {
            "ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "type": type,
        }
        
        if yes_price is not None:
            order["yes_price"] = yes_price
        if no_price is not None:
            order["no_price"] = no_price
        if client_order_id:
            order["client_order_id"] = client_order_id
        if expiration_ts:
            order["expiration_ts"] = expiration_ts
        
        return self._request("POST", "/trade-api/v2/portfolio/orders", json=order)
    
    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an order by ID."""
        return self._request("DELETE", f"/trade-api/v2/portfolio/orders/{order_id}")
    
    def batch_cancel_orders(self, ticker: Optional[str] = None) -> Dict[str, Any]:
        """Cancel all resting orders, optionally filtered by ticker."""
        params = {}
        if ticker:
            params["ticker"] = ticker
        return self._request("DELETE", "/trade-api/v2/portfolio/orders", params=params)
    
    # ─────────────────────────────────────────────────────────────
    # Markets
    # ─────────────────────────────────────────────────────────────
    
    def get_markets(
        self,
        limit: int = 100,
        cursor: Optional[str] = None,
        event_ticker: Optional[str] = None,
        series_ticker: Optional[str] = None,
        status: Optional[str] = None,  # "open", "closed", "settled"
    ) -> Dict[str, Any]:
        """Get markets list."""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if event_ticker:
            params["event_ticker"] = event_ticker
        if series_ticker:
            params["series_ticker"] = series_ticker
        if status:
            params["status"] = status
        return self._request("GET", "/trade-api/v2/markets", params=params)
    
    def get_market(self, ticker: str) -> Dict[str, Any]:
        """Get a single market by ticker."""
        return self._request("GET", f"/trade-api/v2/markets/{ticker}")
    
    def get_orderbook(self, ticker: str, depth: int = 10) -> Dict[str, Any]:
        """Get orderbook for a market."""
        return self._request("GET", f"/trade-api/v2/markets/{ticker}/orderbook", params={"depth": depth})
    
    def get_trades(
        self,
        ticker: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get recent trades."""
        params = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if cursor:
            params["cursor"] = cursor
        return self._request("GET", "/trade-api/v2/markets/trades", params=params)
    
    # ─────────────────────────────────────────────────────────────
    # Events
    # ─────────────────────────────────────────────────────────────
    
    def get_events(
        self,
        limit: int = 100,
        cursor: Optional[str] = None,
        status: Optional[str] = None,
        series_ticker: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get events list."""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if status:
            params["status"] = status
        if series_ticker:
            params["series_ticker"] = series_ticker
        return self._request("GET", "/trade-api/v2/events", params=params)
    
    def get_event(self, event_ticker: str) -> Dict[str, Any]:
        """Get a single event."""
        return self._request("GET", f"/trade-api/v2/events/{event_ticker}")
    
    # ─────────────────────────────────────────────────────────────
    # Exchange
    # ─────────────────────────────────────────────────────────────
    
    def get_exchange_status(self) -> Dict[str, Any]:
        """Get exchange status."""
        return self._request("GET", "/trade-api/v2/exchange/status")


# ─────────────────────────────────────────────────────────────────
# Convenience factory
# ─────────────────────────────────────────────────────────────────

def create_client_from_env() -> KalshiClient:
    """
    Create client from environment variables.
    
    Required env vars:
        KALSHI_API_KEY_ID: Your API key ID
        KALSHI_PRIVATE_KEY_PATH: Path to private key file
        
    Optional:
        KALSHI_BASE_URL: API base URL (default: https://api.elections.kalshi.com)
    """
    api_key_id = os.environ.get("KALSHI_API_KEY_ID")
    private_key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "~/.kalshi/private_key.pem")
    base_url = os.environ.get("KALSHI_BASE_URL", "https://api.elections.kalshi.com")
    
    if not api_key_id:
        raise ValueError("KALSHI_API_KEY_ID environment variable required")
    
    return KalshiClient(
        api_key_id=api_key_id,
        private_key_path=private_key_path,
        base_url=base_url
    )


if __name__ == "__main__":
    # Quick test
    client = KalshiClient(
        api_key_id=os.environ.get("KALSHI_API_KEY_ID", "Ce00cf3a-1002-4eab-aa9c-b69560921052"),
        private_key_path="~/.kalshi/private_key.pem"
    )
    
    balance = client.get_balance()
    print(f"Balance: ${balance['balance'] / 100:.2f}")
    
    positions = client.get_positions()
    print(f"Positions: {len(positions.get('positions', []))}")
