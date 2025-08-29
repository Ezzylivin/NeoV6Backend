// File: backend/services/backtestService.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "./logService.js";

export async function runBacktest({ userId, symbol, timeframe, initialBalance, strategy = "default", risk = "medium" }) {
  const historicalData = await Price.find({ symbol }).sort({ timestamp: 1 });
  if (!historicalData.length) throw new Error("No historical data found");

  let balance = initialBalance;
  let asset = 0;
  let trades = 0;

  for (let i = 1; i < historicalData.length; i++) {
    const prev = historicalData[i - 1].price;
    const current = historicalData[i].price;

    const decision = current > prev ? "BUY" : "SELL"; // simple strategy

    if (decision === "BUY" && balance > current) {
      asset += balance / current;
      balance = 0;
      trades++;
    } else if (decision === "SELL" && asset > 0) {
      balance += asset * current;
      asset = 0;
      trades++;
    }
  }

  const finalPrice = historicalData[historicalData.length - 1].price;
  const finalBalance = balance + asset * finalPrice;

  const result = await Backtest.create({
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance,
    profit: finalBalance - initialBalance,
    strategy,
    risk,
    totalTrades: trades,
    candlesTested: historicalData.length,
    createdAt: new Date(),
  });

  await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | Profit: $${result.profit.toFixed(2)} | Trades: ${trades} | Strategy: ${strategy} | Risk: ${risk}`);
  return result;
}
