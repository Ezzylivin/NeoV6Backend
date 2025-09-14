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
  constructor(initialBalance) {
    this.balance = initialBalance;
    this.position = null;
    this.trades = [];
    this.equityCurve = []; // FIX: Initialize empty
  }
  isInPosition = () => this.position !== null;
  openPosition = (side, price, timestamp) => {
    if (this.isInPosition()) return;
    const sizeDollars = this.balance * 0.95;
    if (sizeDollars <= 0) return;
    this.balance -= sizeDollars;
    this.position = {
      entryTime: timestamp,
      entryPrice: price,
      position: side, // FIX: Use 'position' to match schema
      size: sizeDollars / price,
      commission: 0,
    };
  };
  closePosition = (price, timestamp) => {
    if (!this.isInPosition()) return;
    const value = this.position.size * price;
    this.balance += value;
    const pnl = this.position.position === 'long'
      ? (price - this.position.entryPrice) * this.position.size
      : (this.position.entryPrice - price) * this.position.size;
    this.trades.push({
      ...this.position,
      exitTime: timestamp,
      exitPrice: price,
      profit: pnl,
      result: pnl > 0 ? 'win' : 'loss',
    });
    this.position = null;
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
    const { userId, symbol, strategy, timeframe, initialBalance, startDate, endDate = new Date(), simulateOnly } = params;
    if (!symbol || !strategy) throw new Error("Symbol and strategy are required");
    
    const marketData = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
    const candles = marketData.candles.map(c => ({ timestamp: new Date(c[0]), open: c[1], high: c[2], low: c[3], close: c[4] }));
    if (candles.length < 2) throw new Error("Insufficient market data");

    const pm = new PositionManager(initialBalance);
    if (candles.length > 0) { // FIX: Add first valid equity point
        pm.equityCurve.push({ timestamp: candles[0].timestamp, balance: initialBalance });
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
      const indData = {};
      for (const ind of reqInds) {
        indData[ind.name] = indicators[ind.name][i];
        indData[`prev${ind.name.charAt(0).toUpperCase() + ind.name.slice(1)}`] = indicators[ind.name][i-1];
      }
      const signal = stratModule.getSignal(indData, stratParams, candles[i]);
      if (signal === "BUY" && !pm.isInPosition()) pm.openPosition("long", candles[i].close, candles[i].timestamp);
      else if (signal === "SELL" && pm.isInPosition()) pm.closePosition(candles[i].close, candles[i].timestamp);
    }
    if (pm.isInPosition()) pm.closePosition(candles[candles.length-1].close, candles[candles.length-1].timestamp);

    const results = {
      userId, symbol, timeframe, initialBalance,
      finalBalance: pm.equityCurve.slice(-1)[0].balance,
      strategy: { name: strategy.name, type: strategy.type, parameters: stratParams },
      tradeBreakdown: pm.trades,
      equityCurve: pm.equityCurve,
      startDate, endDate, candlesTested: candles.length,
    };

    if (simulateOnly) return results;
    
    const backtestResult = new Backtest(results);
    await backtestResult.save();
    await logToDb(userId, `Backtest for ${symbol} completed.`);
    return backtestResult;
  } catch (error) {
    console.error("Backtest Service Error:", error);
    throw new Error(error.message || "Backtest engine failed unexpectedly.");
  }
}

export async function runBatchBacktests(userId, configs) {
    // ... batch logic ...
}
