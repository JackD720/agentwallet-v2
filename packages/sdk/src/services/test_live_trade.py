#!/usr/bin/env python3
"""
Test Script: Place a Real Trade Through AgentWallet
This will place a small order on Kalshi to verify the full stack works.
"""

import os
import sys

# Add services to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent_wallet_kalshi import AgentWalletManager, SpendLimit, Rule, RuleResult


def main():
    print("=" * 60)
    print("AgentWallet - Live Trading Test")
    print("=" * 60)
    
    # Initialize
    manager = AgentWalletManager(
        kalshi_api_key_id=os.environ.get("KALSHI_API_KEY_ID", "Ce00cf3a-1002-4eab-aa9c-b69560921052"),
        kalshi_private_key_path="~/.kalshi/private_key.pem",
    )
    
    # Create agent with tight limits for testing
    agent = manager.create_agent(
        name="live-test-agent",
        description="Testing live trades",
        spend_limit=SpendLimit(
            max_per_order=500,       # $5 max per order
            max_per_day=1000,        # $10 max per day
            max_per_week=2500,       # $25 max per week
            max_position_size=10,    # 10 contracts max
        ),
    )
    print(f"\n✅ Created agent: {agent.agent_id}")
    
    wallet = manager.get_wallet(agent.agent_id)
    
    # Check balance
    balance = wallet.get_balance()
    balance_dollars = balance['balance'] / 100
    print(f"✅ Balance: ${balance_dollars:.2f}")
    
    if balance_dollars < 1:
        print("❌ Not enough balance for test trade. Need at least $1.")
        return
    
    # Find a market to trade
    print("\n📊 Finding open markets...")
    markets_resp = wallet.get_markets(status="open", limit=20)
    markets = markets_resp.get("markets", [])
    
    if not markets:
        print("❌ No open markets found")
        return
    
    # Find a cheap market (low yes price = cheap to buy)
    best_market = None
    best_price = 100
    
    for market in markets:
        ticker = market.get("ticker", "")
        yes_price = market.get("yes_ask", 99)
        
        # Skip if no ask price or too expensive
        if yes_price and yes_price < best_price and yes_price <= 20:  # Max 20 cents
            best_market = market
            best_price = yes_price
    
    if not best_market:
        print("❌ No suitable cheap markets found (need yes_ask <= 20 cents)")
        print("\nAvailable markets:")
        for m in markets[:5]:
            print(f"  - {m.get('ticker')}: yes_ask={m.get('yes_ask')}")
        return
    
    ticker = best_market["ticker"]
    title = best_market.get("title", ticker)
    yes_ask = best_market.get("yes_ask", 50)
    
    print(f"\n📈 Selected market:")
    print(f"   Ticker: {ticker}")
    print(f"   Title: {title}")
    print(f"   Yes Ask: {yes_ask}¢")
    
    # Get orderbook
    print("\n📖 Orderbook:")
    orderbook = wallet.get_orderbook(ticker, depth=3)
    print(f"   Yes bids: {orderbook.get('yes', {}).get('bids', [])[:3]}")
    print(f"   Yes asks: {orderbook.get('yes', {}).get('asks', [])[:3]}")
    
    # Place a small order
    order_count = 1
    order_price = min(yes_ask, 20)  # Cap at 20 cents
    order_cost = order_count * order_price
    
    print(f"\n💰 Placing order:")
    print(f"   Side: YES")
    print(f"   Action: BUY")
    print(f"   Count: {order_count} contract(s)")
    print(f"   Price: {order_price}¢")
    print(f"   Total cost: {order_cost}¢ (${order_cost/100:.2f})")
    
    # Confirm
    confirm = input("\n⚠️  Place this order? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("❌ Order cancelled")
        return
    
    # Execute through AgentWallet (with spend controls)
    try:
        result = wallet.create_order(
            ticker=ticker,
            side="yes",
            action="buy",
            count=order_count,
            type="limit",
            yes_price=order_price,
        )
        
        print("\n✅ ORDER PLACED!")
        print(f"   Order ID: {result.get('order', {}).get('order_id', 'N/A')}")
        print(f"   Status: {result.get('order', {}).get('status', 'N/A')}")
        
    except PermissionError as e:
        print(f"\n🚫 Order BLOCKED by controls: {e}")
        return
    except Exception as e:
        print(f"\n❌ Order failed: {e}")
        return
    
    # Check new balance
    new_balance = wallet.get_balance()
    print(f"\n💵 New balance: ${new_balance['balance']/100:.2f}")
    
    # Check positions
    positions = wallet.get_positions()
    print(f"📊 Positions: {len(positions.get('positions', []))}")
    
    # Show audit log
    print("\n📋 Audit Log (last 5 events):")
    for event in manager.get_audit_log(agent_id=agent.agent_id, limit=5):
        print(f"   [{event['timestamp'][:19]}] {event['event_type']} - {event['action_type']}")
    
    print("\n" + "=" * 60)
    print("✅ Live trading test complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
