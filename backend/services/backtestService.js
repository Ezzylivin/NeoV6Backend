// File: src/backend/services/backtestService.js

// Example in-memory storage (replace with DB if using Mongo/Postgres)
let BACKTESTS = [];

// Run backtest
export async function run({ userId, symbol, timeframe, initialBalance, strategy, risk }) {
  // Fake simulation: random profit %
  const profitPct = (Math.random() * 20 - 10).toFixed(2); // -10% to +10%
  const finalBalance = +(initialBalance * (1 + profitPct / 100)).toFixed(2);

  const result = {
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance,
    profit: +(finalBalance - initialBalance).toFixed(2),
    strategy: strategy || "default",
    risk: risk || "medium",
    totalTrades: Math.floor(Math.random() * 20) + 5,
    candlesTested: Math.floor(Math.random() * 500) + 100,
    createdAt: new Date(),
  };

  BACKTESTS.push(result);

  return BACKTESTS.filter((bt) => bt.userId === userId);
}

// Get saved backtests
export async function getAll({ userId, symbol, timeframe }) {
  let results = BACKTESTS.filter((bt) => bt.userId === userId);
  if (symbol) results = results.filter((bt) => bt.symbol === symbol);
  if (timeframe) results = results.filter((bt) => bt.timeframe === timeframe);
  return results;
}
