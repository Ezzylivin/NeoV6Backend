# services/backtest_service.py
import pandas as pd
import numpy as np
from typing import Dict, Any

def run_backtest(df: pd.DataFrame, initial_balance: float = 1000.0, fee: float = 0.001) -> Dict[str, Any]:
    """
    Run a simple backtest using predicted_target column.
    Strategy: Buy when predicted_target > 0, Sell when < 0.
    """
    if "predicted_target" not in df.columns:
        raise ValueError("Missing 'predicted_target' in DataFrame.")

    balance = initial_balance
    position = 0
    equity_curve = []
    trades = []
    max_balance = initial_balance
    drawdowns = []

    for i in range(len(df)):
        price = df["close"].iloc[i]
        signal = np.sign(df["predicted_target"].iloc[i])  # +1 buy, -1 sell, 0 hold

        # Buy
        if signal > 0 and balance > 0:
            position = balance / price
            balance = 0
            trades.append({"action": "buy", "price": price, "time": str(df.index[i])})

        # Sell
        elif signal < 0 and position > 0:
            balance = position * price * (1 - fee)
            position = 0
            trades.append({"action": "sell", "price": price, "time": str(df.index[i])})

        # Equity = balance + open position
        equity = balance + position * price
        equity_curve.append(equity)

        # Track drawdown
        max_balance = max(max_balance, equity)
        drawdowns.append((max_balance - equity) / max_balance)

    final_balance = equity_curve[-1]
    total_profit = final_balance - initial_balance
    max_drawdown = max(drawdowns) * 100
    win_trades = sum(1 for t in trades if t["action"] == "sell" and t["price"] > trades[trades.index(t)-1]["price"])
    total_sells = sum(1 for t in trades if t["action"] == "sell")
    win_rate = (win_trades / total_sells * 100) if total_sells > 0 else 0

    return {
        "initial_balance": initial_balance,
        "final_balance": final_balance,
        "total_profit": total_profit,
        "max_drawdown": max_drawdown,
        "win_rate": win_rate,
        "trades": trades,
        "equity_curve": equity_curve,
    }
