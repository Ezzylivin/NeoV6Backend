// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCVMultiSafe } from "./candleService.js";
import { logToDb } from "./logService.js";

// --- PERFORMANCE: Efficient Bulk Indicator Calculators ---

const calculateAllSMAs = (values, period) => {
  const smas = new Array(values.length).fill(null);
  if (values.length < period) return smas;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  smas[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum = sum - values[i - period] + values[i];
    smas[i] = sum / period;
  }
  return smas;
};

const calculateAllEMAs = (values, period) => {
  const emas = new Array(values.length).fill(null);
  if (values.length < period) return emas;

  const multiplier = 2 / (period + 1);
  let smaSum = 0;
  for (let i = 0; i < period; i++) {
    smaSum += values[i];
  }
  emas[period - 1] = smaSum / period;

  for (let i = period; i < values.length; i++) {
    emas[i] = (values[i] - emas[i - 1]) * multiplier + emas[i - 1];
  }
  return emas;
};

const calculateAllRSIs = (values, period) => {
  const rsis = new Array(values.length).fill(null);
  if (values.length < period + 1) return rsis;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  const calculateRSI = (gain, loss) => {
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - (100 / (1 + rs));
  };
  
  rsis[period] = calculateRSI(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    let currentGain = change > 0 ? change : 0;
    let currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    
    rsis[i] = calculateRSI(avgGain, avgLoss);
  }
  return rsis;
};

// --- Position Management ---

class PositionManager {
  constructor(initialBalance, risk = "Medium", stopLoss = null, takeProfit = null) {
    this.balance = initialBalance;
    this.position = null;
    this.trades = [];
    this.equityCurve = [{ timestamp: null, balance: initialBalance }];
    this.riskOptions = { risk, stopLoss, takeProfit };
  }

  isInPosition() {
    return this.position !== null;
  }

  openPosition(side, price, timestamp, config) {
    if (this.isInPosition()) return;

    const { useSpread = true, useSlippage = true, useCommission = true, spreadPct = 0.1, slippageBps = 5, commissionRate = 0.001 } = config;
    let executionPrice = price;
    if (useSpread) {
      const spread = applySpread(price, spreadPct);
      executionPrice = side === "long" ? spread.buy : spread.sell;
    }
    if (useSlippage) {
      executionPrice = applySlippage(executionPrice, slippageBps);
    }

    const positionSizeDollars = this.balance * 0.95;
    const commission = useCommission ? calculateCommission(positionSizeDollars, commissionRate) : 0;
    
    if (positionSizeDollars <= 0 || this.balance < positionSizeDollars) return;

    this.balance -= positionSizeDollars;
    const size = (positionSizeDollars - commission) / executionPrice;

    this.position = {
      entryTime: timestamp,
      entryPrice: executionPrice,
      side: side,
      size: size,
      commission: commission
    };
  }

  closePosition(price, timestamp, config) {
    if (!this.isInPosition()) return;

    const { useSpread = true, useSlippage = true, useCommission = true, spreadPct = 0.1, slippageBps = 5, commissionRate = 0.001 } = config;
    let executionPrice = price;
    if (useSpread) {
      const spread = applySpread(price, spreadPct);
      executionPrice = this.position.side === "long" ? spread.sell : spread.buy;
    }
    if (useSlippage) {
      executionPrice = applySlippage(executionPrice, slippageBps);
    }

    const orderValue = this.position.size * executionPrice;
    const exitCommission = useCommission ? calculateCommission(orderValue, commissionRate) : 0;
    this.balance += orderValue - exitCommission;

    let profit;
    if (this.position.side === "long") {
      profit = (executionPrice - this.position.entryPrice) * this.position.size;
    } else {
      profit = (this.position.entryPrice - executionPrice) * this.position.size;
    }
    const netProfit = profit - this.position.commission - exitCommission;

    this.trades.push({
      ...this.position,
      exitTime: timestamp,
      exitPrice: executionPrice,
      profit: netProfit,
      duration: new Date(timestamp) - new Date(this.position.entryTime),
      result: netProfit > 0 ? "win" : netProfit < 0 ? "loss" : "breakeven",
      exitCommission: exitCommission
    });

    this.position = null;
  }

  shouldStopLoss(currentPrice) {
    if (!this.isInPosition() || !this.riskOptions.stopLoss) return false;
    const { side, entryPrice } = this.position;
    if (side === "long") {
      return currentPrice <= entryPrice * (1 - this.riskOptions.stopLoss);
    } else {
      return currentPrice >= entryPrice * (1 + this.riskOptions.stopLoss);
    }
  }

  shouldTakeProfit(currentPrice) {
    if (!this.isInPosition() || !this.riskOptions.takeProfit) return false;
    const { side, entryPrice } = this.position;
    if (side === "long") {
      return currentPrice >= entryPrice * (1 + this.riskOptions.takeProfit);
    } else {
      return currentPrice <= entryPrice * (1 - this.riskOptions.takeProfit);
    }
  }

  updateEquityCurve(timestamp, currentPrice) {
    let currentValue = this.balance;
    if (this.isInPosition()) {
      currentValue += this.position.size * currentPrice;
    }
    this.equityCurve.push({ timestamp, balance: currentValue });
  }
}

// --- Main Backtest Engine ---

export async function runBacktest(params) {
  const { userId, symbol, strategy, timeframe = "1h", initialBalance = 10000, risk = "Medium", takeProfit = null, stopLoss = null, startDate, endDate, tradeConfig = {}, simulateOnly = false } = params;
  
  try {
    if (!symbol || !strategy || !strategy.type) {
      throw new Error("Symbol and a valid strategy object with a 'type' are required");
    }

    const marketData = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
    const candles = marketData.candles.map(c => ({
      timestamp: new Date(c[0]),
      open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
    }));
    
    if (candles.length < 2) {
      throw new Error(`Insufficient market data for ${symbol} in the given range.`);
    }

    const positionManager = new PositionManager(initialBalance, risk, stopLoss, takeProfit);
    const prices = candles.map(c => c.close);
    const indicators = {};
    const stratParams = strategy.parameters || {};
    
    switch(strategy.type.toUpperCase()) {
      case "SMA":
        indicators.fast = calculateAllSMAs(prices, stratParams.fast);
        indicators.slow = calculateAllSMAs(prices, stratParams.slow);
        break;
      case "EMA":
        indicators.fast = calculateAllEMAs(prices, stratParams.fast);
        indicators.slow = calculateAllEMAs(prices, stratParams.slow);
        break;
      case "RSI":
        indicators.rsi = calculateAllRSIs(prices, stratParams.period);
        break;
    }
    
    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      positionManager.updateEquityCurve(candle.timestamp, candle.close);

      if (positionManager.isInPosition()) {
        if (positionManager.shouldStopLoss(candle.close) || positionManager.shouldTakeProfit(candle.close)) {
          positionManager.closePosition(candle.close, candle.timestamp, tradeConfig);
        }
      }
      
      const signal = executeStrategy(strategy.type, i, stratParams, indicators);

      if (signal === "BUY" && !positionManager.isInPosition()) {
        positionManager.openPosition("long", candle.close, candle.timestamp, tradeConfig);
      } else if (signal === "SELL" && positionManager.isInPosition()) {
        positionManager.closePosition(candle.close, candle.timestamp, tradeConfig);
      }
    }
    
    if (positionManager.isInPosition()) {
      const lastCandle = candles[candles.length - 1];
      positionManager.closePosition(lastCandle.close, lastCandle.timestamp, tradeConfig);
    }

    const finalBalance = positionManager.equityCurve[positionManager.equityCurve.length - 1].balance;
    
    if (simulateOnly) {
      return { finalBalance, trades: positionManager.trades, equityCurve: positionManager.equityCurve };
    }

    const backtestResult = new Backtest({
      userId,
      symbol: symbol.toUpperCase(),
      timeframe,
      initialBalance,
      finalBalance,
      profit: finalBalance - initialBalance,
      strategy: {
        name: strategy.name || strategy.type,
        type: strategy.type,
        parameters: strategy.parameters
      },
      tradeBreakdown: positionManager.trades,
      equityCurve: positionManager.equityCurve,
    });
    await backtestResult.save();
    await logToDb(userId, `Backtest for ${symbol} completed. Final Balance: ${finalBalance.toFixed(2)}`);
    return backtestResult;

  } catch (error) {
    console.error("Backtest Service Error:", error);
    if (userId && symbol) {
      await logToDb(userId, `Backtest for ${symbol} failed: ${error.message}`);
    }
    throw error;
  }
}

// --- Batch Backtest Function ---

export async function runBatchBacktests(userId, configs) {
  const results = [];
  const errors = [];

  const promises = configs.map(config => runBacktest({ userId, ...config }));
  const outcomes = await Promise.allSettled(promises);

  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      results.push({ config: configs[index], success: true, result: outcome.value });
    } else {
      errors.push({ config: configs[index], success: false, error: outcome.reason.message });
    }
  });

  const successfulResults = results.map(r => r.result);
  const bestPerforming = successfulResults.length > 0
    ? successfulResults.sort((a, b) => b.finalBalance - a.finalBalance)[0]
    : null;

  const summary = {
    totalRuns: configs.length,
    successful: results.length,
    failed: errors.length,
    bestNetProfit: bestPerforming ? bestPerforming.profit : 0,
    bestStrategyConfig: bestPerforming ? bestPerforming.strategy : null,
  };

  await logToDb(userId, `Batch backtest completed: ${summary.successful}/${summary.totalRuns} successful.`);
  return { results, errors, summary };
}

// --- Strategy Execution Helper ---

function executeStrategy(strategyType, index, params, indicators) {
  switch (strategyType.toUpperCase()) {
    case "SMA":
    case "EMA": {
      const fast = indicators.fast[index];
      const slow = indicators.slow[index];
      const prevFast = indicators.fast[index - 1];
      const prevSlow = indicators.slow[index - 1];
      if (fast === null || slow === null || prevFast === null || prevSlow === null) return null;
      if (prevFast <= prevSlow && fast > slow) return "BUY";
      if (prevFast >= prevSlow && fast < slow) return "SELL";
      return null;
    }
    case "RSI": {
      const rsi = indicators.rsi[index];
      const prevRsi = indicators.rsi[index - 1];
      if (rsi === null || prevRsi === null) return null;
      if (prevRsi <= params.oversold && rsi > params.oversold) return "BUY";
      if (prevRsi >= params.overbought && rsi < params.overbought) return "SELL";
      return null;
    }
    default:
      return null;
  }
}

// --- Realism Helpers ---

function applySpread(price, spreadPct = 0.1) {
  const spread = (spreadPct / 100) / 2;
  return { buy: price * (1 + spread), sell: price * (1 - spread) };
}

function applySlippage(price, slippageBps = 5) {
  const slippage = (slippageBps / 10000) * (0.5 + Math.random());
  return price * (1 + slippage);
}

function calculateCommission(orderValue, commissionRate = 0.001) {
  return orderValue * commissionRate;
}
