// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCVMultiSafe } from "./candleService.js";
import { getStrategy } from '../strategies/strategyManager.js';
import { logToDb } from "./logService.js";

// --- PERFORMANCE: Efficient Bulk Indicator Calculators ---

const calculateAllMACDs = (values, fastPeriod, slowPeriod, signalPeriod) => {
  const macds = new Array(values.length).fill(null);
  if (values.length < slowPeriod) return macds;

  const fastEMAs = calculateAllEMAs(values, fastPeriod);
  const slowEMAs = calculateAllEMAs(values, slowPeriod);

  const macdLine = fastEMAs.map((fast, i) => {
    const slow = slowEMAs[i];
    return fast !== null && slow !== null ? fast - slow : null;
  });

  const signalLine = calculateAllEMAs(macdLine.filter(v => v !== null), signalPeriod);
  
  let signalIndex = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macds[i] = {
        MACD: macdLine[i],
        signal: signalLine[signalIndex] || null,
        histogram: signalLine[signalIndex] ? macdLine[i] - signalLine[signalIndex] : null,
      };
      signalIndex++;
    }
  }
  return macds;
};

const calculateAllBollingerBands = (values, period, stdDev) => {
  const bands = new Array(values.length).fill(null);
  if (values.length < period) return bands;

  const smas = calculateAllSMAs(values, period);
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = smas[i];
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    
    bands[i] = {
      middle: mean,
      upper: mean + (sd * stdDev),
      lower: mean - (sd * stdDev),
    };
  }
  return bands;
};

const calculateAllStochastics = (candles, kPeriod, dPeriod) => {
  const stochs = new Array(candles.length).fill(null);
  if (candles.length < kPeriod) return stochs;

  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const lowestLow = Math.min(...slice.map(c => c.low));
    const highestHigh = Math.max(...slice.map(c => c.high));
    const currentClose = candles[i].close;
    
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
    
    stochs[i] = { K: k, D: null };
  }
  
  const dValues = calculateAllSMAs(kValues, dPeriod);

  let dIndex = 0;
  for (let i = kPeriod - 1; i < stochs.length; i++) {
      if(stochs[i]) {
          stochs[i].D = dValues[dIndex] || null;
          dIndex++;
      }
  }
  return stochs;
};

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

  openPosition(side, price, timestamp, config = {}) {
    if (this.isInPosition()) return;

    const executionPrice = price;
    const positionSizeDollars = this.balance * 0.95;
    const commission = 0;
    
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

  closePosition(price, timestamp, config = {}) {
    if (!this.isInPosition()) return;

    const executionPrice = price;
    const orderValue = this.position.size * executionPrice;
    const exitCommission = 0;
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
      let unrealizedPnl = 0;
      if (this.position.side === 'long') {
          unrealizedPnl = (currentPrice - this.position.entryPrice) * this.position.size;
      } else {
          unrealizedPnl = (this.position.entryPrice - currentPrice) * this.position.size;
      }
      currentValue += (this.position.size * this.position.entryPrice) + unrealizedPnl;
    }
    this.equityCurve.push({ timestamp, balance: currentValue });
  }
}


/**
 * Runs a complete backtest synchronously, saves the result, and returns the full document.
 */
export async function runBacktest(params) {
  const { userId, symbol, strategy, timeframe = "1h", initialBalance = 10000, stopLoss = null, takeProfit = null, startDate, endDate, realismConfig = {}, simulateOnly = false } = params;
  
  try {
    if (!symbol || !strategy || !strategy.type) {
      throw new Error("Symbol and a valid strategy object with a 'type' are required");
    }

    
    const marketData = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
    const candles = marketData.candles.map(c => ({
      timestamp: new Date(c[0]), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
    }));
    
    if (candles.length < 2) {
      throw new Error(`Insufficient market data for ${symbol} in the given range.`);
    }

    const positionManager = new PositionManager(initialBalance, "Medium", stopLoss, takeProfit);
    const prices = candles.map(c => c.close);
    const indicators = {};
    const stratParams = strategy.parameters || {};
    const strategyModule = getStrategy(strategy.type);
    
   // ... inside the runBacktest function ...
  const requiredIndicators = strategyModule.requiredIndicators(stratParams);
  for (const ind of requiredIndicators) {
      switch(ind.type.toUpperCase()) {
          case 'SMA': indicators[ind.name] = calculateAllSMAs(prices, ind.period); break;
          case 'EMA': indicators[ind.name] = calculateAllEMAs(prices, ind.period); break;
          case 'RSI': indicators[ind.name] = calculateAllRSIs(prices, ind.period); break;
          // --- ADD THESE NEW CASES ---
          case 'MACD': indicators[ind.name] = calculateAllMACDs(prices, stratParams.fast, stratParams.slow, stratParams.signal); break;
          case 'BBANDS': indicators[ind.name] = calculateAllBollingerBands(prices, ind.period, ind.stdDev); break;
          case 'STOCH': indicators[ind.name] = calculateAllStochastics(candles, stratParams.kPeriod, stratParams.dPeriod); break;
      }
  }

    for (let i = 1; i < candles.length; i++) {
        const candle = candles[i];
        positionManager.updateEquityCurve(candle.timestamp, candle.close);

        if (positionManager.isInPosition()) {
            if (positionManager.shouldStopLoss(candle.close) || positionManager.shouldTakeProfit(candle.close)) {
                positionManager.closePosition(candle.close, candle.timestamp, realismConfig);
            }
        }

        const indicatorData = {};
        for (const ind of requiredIndicators) {
            indicatorData[ind.name] = indicators[ind.name][i];
            const prevName = `prev${ind.name.charAt(0).toUpperCase() + ind.name.slice(1)}`;
            indicatorData[prevName] = indicators[ind.name][i-1];
        }
        
        const signal = strategyModule.getSignal(indicatorData, stratParams);

        if (signal === "BUY" && !positionManager.isInPosition()) {
            positionManager.openPosition("long", candle.close, candle.timestamp, realismConfig);
        } else if (signal === "SELL" && positionManager.isInPosition()) {
            positionManager.closePosition(candle.close, candle.timestamp, realismConfig);
        }
    }
    
    if (positionManager.isInPosition()) {
        const lastCandle = candles[candles.length - 1];
        positionManager.closePosition(lastCandle.close, lastCandle.timestamp, realismConfig);
    }

    const finalBalance = positionManager.equityCurve.slice(-1)[0].balance;
    const results = {
        userId,
        symbol: symbol.toUpperCase(),
        timeframe,
        initialBalance,
        finalBalance,
        strategy: {
          name: strategy.name || strategy.type,
          type: strategy.type,
          parameters: strategy.parameters
        },
        tradeBreakdown: positionManager.trades,
        equityCurve: positionManager.equityCurve,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        candlesTested: candles.length,
        status: 'completed',
    };
    
    if (simulateOnly) {
        return results;
    }

    const backtestResult = new Backtest(results);
    await backtestResult.save();
    
    await logToDb(userId, `Backtest for ${symbol} completed. Final Balance: ${backtestResult.finalBalance.toFixed(2)}`);
    return backtestResult;

  } catch (error) {
    console.error("Backtest Service Error:", error);
    if (userId && symbol) {
      await logToDb(userId, `Backtest for ${symbol} failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Runs a batch of backtests concurrently and returns the results.
 * @param {string} userId - The ID of the user running the batch.
 * @param {Array<object>} configs - An array of backtest configuration objects.
 * @returns {Promise<object>} A summary of the batch run.
 */
export async function runBatchBacktests(userId, configs) {
  const successfulResults = [];
  const failedRuns = [];

  const outcomes = await Promise.allSettled(
    configs.map(config => runBacktest({ userId, ...config }))
  );

  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      successfulResults.push(outcome.value);
    } else {
      failedRuns.push({ 
        config: configs[index], 
        error: outcome.reason.message 
      });
    }
  });

  const bestPerforming = successfulResults.length > 0
    ? successfulResults.reduce((best, current) => 
        (current.profit > best.profit) ? current : best
      )
    : null;

  const summary = {
    totalRuns: configs.length,
    successful: successfulResults.length,
    failed: failedRuns.length,
    bestNetProfit: bestPerforming ? bestPerforming.profit : 0,
    bestStrategyConfig: bestPerforming ? bestPerforming.strategy : null,
    bestBacktestId: bestPerforming ? bestPerforming._id : null,
  };
  
  await logToDb(userId, `Batch backtest completed: ${summary.successful}/${summary.totalRuns} successful.`);
  
  return { summary, results: successfulResults, errors: failedRuns };
}
