// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Price from "../dbStructure/price.js";

/**
 * Default strategy parameters
 */
export const DEFAULT_STRATEGY_PARAMS = {
  movingAveragePeriod: { default: 14, description: "Period for the moving average. Example: 14" },
  rsiPeriod: { default: 14, description: "Period for RSI calculation. Example: 14" },
  rsiOverbought: { default: 70, description: "RSI level considered overbought. Example: 70" },
  rsiOversold: { default: 30, description: "RSI level considered oversold. Example: 30" },
};

/**
 * Calculate simple moving average
 */
function SMA(data, period, key = "close") {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, bar) => acc + bar[key], 0);
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * Calculate RSI
 */
function RSI(data, period, key = "close") {
  const changes = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i][key] - data[i - 1][key]);
  }

  const rsi = [];
  for (let i = 0; i < changes.length; i++) {
    if (i < period) {
      rsi.push(null);
    } else {
      const slice = changes.slice(i - period, i);
      const gains = slice.filter((v) => v > 0).reduce((a, b) => a + b, 0) / period;
      const losses = Math.abs(slice.filter((v) => v < 0).reduce((a, b) => a + b, 0) / period);
      const rs = gains / (losses || 1);
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  rsi.unshift(null); // align with data length
  return rsi;
}

/**
 * Run a single backtest with full engine
 */
export async function runBacktest(payload) {
  const {
    userId,
    symbol,
    timeframe,
    initialBalance,
    strategy,
    risk,
    takeProfit,
    stopLoss,
    limit,
    startDate,
    endDate,
    tradeConfig,
  } = payload;

  const priceData = await Price.find({
    symbol,
    timeframe,
    timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
  }).sort({ timestamp: 1 });

  if (!priceData || !priceData.length) throw new Error("No price data available");

  let equity = initialBalance || 1000;
  let position = null; // null, "Long", "Short"
  let entryPrice = 0;
  const trades = [];
  const equityCurve = [];

  // Precompute indicators
  const ma = SMA(priceData, strategy.parameters?.movingAveragePeriod || 14);
  const rsi = RSI(priceData, strategy.parameters?.rsiPeriod || 14);

  for (let i = 0; i < priceData.length; i++) {
    const bar = priceData[i];
    const barMA = ma[i];
    const barRSI = rsi[i];

    // Skip if indicators not ready
    if (barMA === null || barRSI === null) {
      equityCurve.push({ time: bar.timestamp, equity });
      continue;
    }

    // --- Strategy Logic Example ---
    // Long if price > MA and RSI < oversold
    if (!position && bar.close > barMA && barRSI < (strategy.parameters?.rsiOversold ?? 30)) {
      position = "Long";
      entryPrice = bar.close;
    }

    // Short if price < MA and RSI > overbought
    if (!position && bar.close < barMA && barRSI > (strategy.parameters?.rsiOverbought ?? 70)) {
      position = "Short";
      entryPrice = bar.close;
    }

    // --- Close positions ---
    if (position === "Long") {
      let exit = false;
      // Take profit / stop loss
      if (takeProfit && bar.close >= entryPrice * (1 + takeProfit / 100)) exit = true;
      if (stopLoss && bar.close <= entryPrice * (1 - stopLoss / 100)) exit = true;
      // Random news or slippage
      if (tradeConfig.useRandomEvents && Math.random() < 0.001) exit = true;

      if (exit) {
        const profit = (bar.close - entryPrice) * (equity / entryPrice);
        equity += profit;
        trades.push({ time: bar.timestamp, type: "Long", entry: entryPrice, exit: bar.close, profit });
        position = null;
        entryPrice = 0;
      }
    }

    if (position === "Short") {
      let exit = false;
      if (takeProfit && bar.close <= entryPrice * (1 - takeProfit / 100)) exit = true;
      if (stopLoss && bar.close >= entryPrice * (1 + stopLoss / 100)) exit = true;
      if (tradeConfig.useRandomEvents && Math.random() < 0.001) exit = true;

      if (exit) {
        const profit = (entryPrice - bar.close) * (equity / entryPrice);
        equity += profit;
        trades.push({ time: bar.timestamp, type: "Short", entry: entryPrice, exit: bar.close, profit });
        position = null;
        entryPrice = 0;
      }
    }

    equityCurve.push({ time: bar.timestamp, equity });
    if (equity <= 0) equity = 0;
  }

  // Metrics
  const maxEquity = Math.max(...equityCurve.map((p) => p.equity));
  const minEquity = Math.min(...equityCurve.map((p) => p.equity));
  const maxDrawdown = ((maxEquity - minEquity) / maxEquity) * 100;
  const netProfit = equity - initialBalance;

  const backtest = new Backtest({
    userId,
    symbol,
    timeframe,
    initialBalance,
    strategy,
    risk,
    takeProfit,
    stopLoss,
    limit,
    startDate,
    endDate,
    tradeConfig,
    equityCurve,
    trades,
    metrics: { maxDrawdown, netProfit },
  });
  await backtest.save();

  return { backtestId: backtest._id, equityCurve, trades, metrics: backtest.metrics };
}

/**
 * Run multiple backtests in batch
 */
export async function runBatchBacktests(userId, strategyId = null, paramCombos = []) {
  const results = [];
  for (const combo of paramCombos) {
    try {
      const result = await runBacktest(combo);
      results.push(result);
    } catch (err) {
      console.error("[BacktestService] Error in batch backtest:", err.message);
    }
  }
  return results;
}

/**
 * Run a realistic backtest with realism toggles
 */
export async function runRealisticBacktest(payload) {
  const { tradeConfig = {} } = payload;

  payload.tradeConfig = {
    useNews: tradeConfig.useNews ?? true,
    useSlippage: tradeConfig.useSlippage ?? true,
    useSpread: tradeConfig.useSpread ?? true,
    useRandomEvents: tradeConfig.useRandomEvents ?? true,
    baseSlippageBps: tradeConfig.baseSlippageBps ?? 5,
    ...tradeConfig,
  };

  return await runBacktest(payload);
}
