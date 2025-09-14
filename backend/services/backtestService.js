import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCVMultiSafe } from "./candleService.js";
import { getStrategy } from '../strategies/strategyManager.js';
import { logToDb } from "./logService.js";

// --- INDICATOR CALCULATORS ---
const calculateAllSMAs = (values, period) => {
  const smas = new Array(values.length).fill(null);
  if (values.length < period) return smas;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
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
  for (let i = 0; i < period; i++) smaSum += values[i];
  emas[period - 1] = smaSum / period;
  for (let i = period; i < values.length; i++) {
    emas[i] = (values[i] - emas[i - 1]) * multiplier + emas[i - 1];
  }
  return emas;
};
const calculateAllRSIs = (values, period) => {
  const rsis = new Array(values.length).fill(null);
  if (values.length < period + 1) return rsis;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  const calculateRSI = (gain, loss) => loss === 0 ? 100 : 100 - (100 / (1 + (gain / loss)));
  rsis[period] = calculateRSI(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    rsis[i] = calculateRSI(avgGain, avgLoss);
  }
  return rsis;
};
const calculateAllMACDs = (values, fast, slow, signal) => {
  const macds = new Array(values.length).fill(null);
  if (values.length < slow) return macds;
  const fastEMAs = calculateAllEMAs(values, fast);
  const slowEMAs = calculateAllEMAs(values, slow);
  const macdLine = fastEMAs.map((f, i) => f !== null && slowEMAs[i] !== null ? f - slowEMAs[i] : null);
  const signalLine = calculateAllEMAs(macdLine.filter(v => v !== null), signal);
  let sigIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macds[i] = { MACD: macdLine[i], signal: signalLine[sigIdx] || null };
      sigIdx++;
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
    const sd = Math.sqrt(slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period);
    bands[i] = { middle: mean, upper: mean + (sd * stdDev), lower: mean - (sd * stdDev) };
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
    const k = ((candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
    stochs[i] = { K: k, D: null };
  }
  const dValues = calculateAllSMAs(kValues, dPeriod);
  let dIndex = 0;
  for (let i = kPeriod - 1; i < stochs.length; i++) {
    if (stochs[i]) stochs[i].D = dValues[dIndex++] || null;
  }
  return stochs;
};

// --- POSITION MANAGER ---
class PositionManager {
  constructor({ initialBalance, stopLoss, takeProfit, risk, positionSide }) {
    this.balance = initialBalance;
    this.position = null;
    this.trades = [];
    this.equityCurve = [];
    this.config = {
      stopLoss: stopLoss / 100,
      takeProfit: takeProfit / 100,
      positionSide,
      risk,
    };
  }
  
  getPortfolioPctForRisk() {
    switch(this.config.risk) {
      case 'Low': return 0.10;
      case 'Medium': return 0.25;
      case 'High': return 0.50;
      default: return 0.25;
    }
  }

  isInPosition = () => this.position !== null;

  openPosition = (side, price, timestamp) => {
    if (this.isInPosition() || (this.config.positionSide !== 'both' && this.config.positionSide !== side)) return;
    const portfolioPct = this.getPortfolioPctForRisk();
    const positionSizeDollars = this.balance * portfolioPct;
    const commission = 0; // Commission removed
    if (positionSizeDollars <= 0) return;
    this.balance -= positionSizeDollars;
    this.position = {
      entryTime: timestamp,
      entryPrice: price,
      position: side,
      size: (positionSizeDollars - commission) / price,
      commission,
    };
  };

  closePosition = (price, timestamp) => {
    if (!this.isInPosition()) return;
    const orderValue = this.position.size * price;
    const exitCommission = 0; // Commission removed
    this.balance += orderValue - exitCommission;
    const profit = this.position.position === 'long'
      ? (price - this.position.entryPrice) * this.position.size
      : (this.position.entryPrice - price) * this.position.size;
    this.trades.push({
      ...this.position,
      exitTime: timestamp,
      exitPrice: price,
      profit: profit - this.position.commission - exitCommission,
      exitCommission,
      result: profit > 0 ? 'win' : 'loss',
    });
    this.position = null;
  };
  
  shouldStopLoss = (currentPrice) => {
    if (!this.isInPosition() || !this.config.stopLoss) return false;
    const { position, entryPrice } = this.position;
    if (position === "long") return currentPrice <= entryPrice * (1 - this.config.stopLoss);
    return currentPrice >= entryPrice * (1 + this.config.stopLoss);
  };

  shouldTakeProfit = (currentPrice) => {
    if (!this.isInPosition() || !this.config.takeProfit) return false;
    const { position, entryPrice } = this.position;
    if (position === "long") return currentPrice >= entryPrice * (1 + this.config.takeProfit);
    return currentPrice <= entryPrice * (1 - this.config.takeProfit);
  };

  updateEquityCurve = (timestamp, price) => {
    let equity = this.balance;
    if (this.isInPosition()) {
      const pnl = this.position.position === 'long'
        ? (price - this.position.entryPrice) * this.position.size
        : (this.position.entryPrice - price) * this.position.size;
      equity += (this.position.size * this.position.entryPrice) + pnl;
    }
    this.equityCurve.push({ timestamp, balance: equity });
  };
}

// --- MAIN BACKTEST ENGINE ---
export async function runBacktest(params) {
  try {
    const { userId, symbol, strategy, timeframe, startDate, endDate = new Date(), ...config } = params;
    if (!symbol || !strategy) throw new Error("Symbol and strategy are required");
    
    const marketData = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
    const candles = marketData.candles.map(c => ({ timestamp: new Date(c[0]), open: c[1], high: c[2], low: c[3], close: c[4] }));
    if (candles.length < 2) throw new Error("Insufficient market data");

    const pm = new PositionManager(config);
    if (candles.length > 0) {
        pm.equityCurve.push({ timestamp: candles[0].timestamp, balance: config.initialBalance });
    }

    const prices = candles.map(c => c.close);
    const indicators = {};
    const stratParams = strategy.parameters || {};
    const stratModule = getStrategy(strategy.type);
    const reqInds = stratModule.requiredIndicators(stratParams);

    for (const ind of reqInds) {
      switch (ind.type.toUpperCase()) {
        case 'SMA': indicators[ind.name] = calculateAllSMAs(prices, ind.period); break;
        case 'EMA': indicators[ind.name] = calculateAllEMAs(prices, ind.period); break;
        case 'RSI': indicators[ind.name] = calculateAllRSIs(prices, ind.period); break;
        case 'MACD': indicators[ind.name] = calculateAllMACDs(prices, stratParams.fast, stratParams.slow, stratParams.signal); break;
        case 'BBANDS': indicators[ind.name] = calculateAllBollingerBands(prices, ind.period, ind.stdDev); break;
        case 'STOCH': indicators[ind.name] = calculateAllStochastics(candles, stratParams.kPeriod, stratParams.dPeriod); break;
      }
    }

    for (let i = 1; i < candles.length; i++) {
      pm.updateEquityCurve(candles[i].timestamp, candles[i].close);
      if (pm.isInPosition()) {
        if (pm.shouldStopLoss(candles[i].close) || pm.shouldTakeProfit(candles[i].close)) {
          pm.closePosition(candles[i].close, candles[i].timestamp);
        }
      }
      const indData = {};
      for (const ind of reqInds) {
        indData[ind.name] = indicators[ind.name][i];
        indData[`prev${ind.name.charAt(0).toUpperCase() + ind.name.slice(1)}`] = indicators[ind.name][i-1];
      }
      const signal = stratModule.getSignal(indData, stratParams, candles[i]);
      if (signal === "BUY" && !pm.isInPosition()) pm.openPosition("long", candles[i].close, candles[i].timestamp);
      else if (signal === "SELL" && !pm.isInPosition()) pm.openPosition("short", candles[i].close, candles[i].timestamp);
      else if (signal === "EXIT" && pm.isInPosition()) pm.closePosition(candles[i].close, candles[i].timestamp);
    }
    if (pm.isInPosition()) pm.closePosition(candles[candles.length-1].close, candles[candles.length-1].timestamp);

    const results = {
      userId, symbol, timeframe, initialBalance: config.initialBalance,
      finalBalance: pm.equityCurve.slice(-1)[0].balance,
      strategy: { name: strategy.name, type: strategy.type, parameters: stratParams },
      tradeBreakdown: pm.trades,
      equityCurve: pm.equityCurve,
      startDate, endDate, candlesTested: candles.length,
    };
    
    if (params.simulateOnly) return results;
    
    const backtestResult = new Backtest(results);
    await backtestResult.save();
    await logToDb(userId, `Backtest for ${symbol} completed.`);
    return backtestResult;
  } catch (error) {
    console.error("Backtest Service Error:", error);
    throw new Error(error.message || "Backtest engine failed unexpectedly.");
  }
}
// ... (runBatchBacktests function remains the same) ...

export async function runBatchBacktests(userId, configs) {
    try {
    const outcomes = await Promise.allSettled(configs.map(config => runBacktest({ userId, ...config })));
    const successfulResults = outcomes.filter(o => o.status === 'fulfilled').map(o => o.value);
    const failedRuns = outcomes.filter(o => o.status === 'rejected').map((o, i) => ({ config: configs[i], error: o.reason.message }));
    const bestPerforming = successfulResults.length > 0 ? successfulResults.reduce((best, current) => (current.profit > best.profit) ? current : best) : null;
    const summary = {
      totalRuns: configs.length,
      successful: successfulResults.length,
      failed: failedRuns.length,
      bestNetProfit: bestPerforming ? bestPerforming.profit : 0,
      bestStrategyConfig: bestPerforming ? bestPerforming.strategy : null,
    };
    await logToDb(userId, `Batch backtest completed: ${summary.successful}/${summary.totalRuns} successful.`);
    return { summary, results: successfulResults, errors: failedRuns };
  } catch (error) {
    console.error("A critical error occurred in the batch backtest service:", error);
    throw new Error(error.message || "Batch backtest engine failed unexpectedly.");
  }
}
