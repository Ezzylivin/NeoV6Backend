// File: backend/services/backtestService.js
// UPGRADED: Imports data dependency from the correct service layer.

import * as ti from 'technicalindicators';
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from '../strategies/strategyManager.js';
import { logToDb } from "./logService.js";
// FIX: Correctly import from the service layer, not the controller layer
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- POSITION MANAGER (Unchanged) ---
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
    const commission = 0; 
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
    const exitCommission = 0; 
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

// --- MAIN BACKTEST ENGINE (Refactored) ---
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
    const highPrices = candles.map(c => c.high);
    const lowPrices = candles.map(c => c.low);
    const ohlcInput = {
      open: candles.map(c => c.open),
      high: highPrices,
      low: lowPrices,
      close: prices,
      timestamp: candles.map(c => c.timestamp),
    };

    const indicators = {};
    const stratParams = strategy.parameters || {};
    const stratModule = getStrategy(strategy.type);
    const reqInds = stratModule.requiredIndicators(stratParams);

    for (const ind of reqInds) {
      let results = [];
      let padLength = 0;

      switch (ind.type.toUpperCase()) {
        case 'SMA':
          results = ti.SMA.calculate({ values: prices, period: ind.period });
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'EMA':
          results = ti.EMA.calculate({ values: prices, period: ind.period });
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'RSI':
          results = ti.RSI.calculate({ values: prices, period: ind.period });
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'MACD':
          results = ti.MACD.calculate({
            values: prices,
            fastPeriod: stratParams.fast,
            slowPeriod: stratParams.slow,
            signalPeriod: stratParams.signal,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'BBANDS':
          results = ti.BollingerBands.calculate({
            values: prices,
            period: ind.period,
            stdDev: ind.stdDev
          });
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'STOCH':
          results = ti.Stochastic.calculate({
            high: highPrices,
            low: lowPrices,
            close: prices,
            period: stratParams.kPeriod,
            signalPeriod: stratParams.dPeriod
    .map(r => ({ K: r.k, D: r.d }));
          padLength = candles.length - formattedStoch.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...formattedStoch];
          break;
        case 'ADX':
          results = ti.ADX.calculate(ohlcInput);
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'ATR':
          results = ti.ATR.calculate(ohlcInput);
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        case 'VWAP':
          results = ti.VWAP.calculate(ohlcInput);
          padLength = candles.length - results.length;
          indicators[ind.name] = [...Array(padLength).fill(null), ...results];
          break;
        default:
          console.warn(`Unsupported indicator type: ${ind.type}`);
          break;
      }
    }

    let isPythonResult = false;
    let finalResult = null;
    let finalEquity = config.initialBalance;

    for (let i = 0; i < candles.length; i++) {
        const currentCandle = candles[i];
        pm.updateEquityCurve(currentCandle.timestamp, currentCandle.close);
        
        const minPeriod = Math.min(...reqInds.map(ind => ind.period || 0));
        if (i < minPeriod -1) continue;

        if (pm.isInPosition()) {
            if (pm.shouldStopLoss(currentCandle.close)) {
                pm.closePosition(currentCandle.close, currentCandle.timestamp);
            } else if (pm.shouldTakeProfit(currentCandle.close)) {
                pm.closePosition(currentCandle.close, currentCandle.timestamp);
            }
        }

        const signal = stratModule.check(currentCandle, indicators, i, stratParams, pm.isInPosition());

        if (signal === 'long') {
            pm.openPosition('long', currentCandle.close, currentCandle.timestamp);
        } else if (signal === 'short') {
            pm.openPosition('short', currentCandle.close, currentCandle.timestamp);
        }
    }

    if (pm.isInPosition()) {
        pm.closePosition(candles[candles.length - 1].close, new Date());
    }

    finalEquity = pm.balance;

    const totalReturn = ((finalEquity - config.initialBalance) / config.initialBalance) * 100;
    const totalTrades = pm.trades.length;
    const winningTrades = pm.trades.filter(t => t.result === 'win').length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    
    // This is the result shape the frontend expects
    const backtestResult = {
        metrics: {
            totalReturn,
            totalTrades,
            winRate,
            finalBalance: finalEquity,
            initialBalance: config.initialBalance,
        },
        trades: pm.trades,
        equityCurve: pm.equityCurve,
        // Other metadata
        userId,
        symbol,
        strategy: strategy.name,
        timeframe,
        startDate,
        endDate,
        isPythonResult
    };

    if (!params.simulateOnly) {
        // We save the flat structure to the DB
        finalResult = await Backtest.create({
            userId,
            symbol,
            strategy: strategy.name,
            timeframe,
            startDate,
            endDate,
            initialBalance: config.initialBalance,
            finalBalance: finalEquity,
            totalReturn,
            totalTrades,
            winRate,
            trades: pm.trades,
            equityCurve: pm.equityCurve,
            isPythonResult
        });
        logToDb(userId, `Backtest run: ${strategy.name} on ${symbol} (${timeframe})`);
    }

    // But we return the nested structure the frontend wants
    return backtestResult;

  } catch (err) {
    throw err;
  }
}

/**
 * Runs multiple backtests from a list of configurations.
* @param {string} userId - The user ID.
 * @param {Array<object>} configs - The list of backtest configurations.
 * @returns {Array<object>} - A list of backtest results.
 */
export async function runBatchBacktests(userId, configs) {
    const results = [];
    for (const config of configs) {
        try {
            const result = await runBacktest({ ...config, userId });
            results.push({ ...result, success: true });
        } catch (error) {
            results.push({ config, success: false, message: error.message });
        }
    }
    return results;
}
