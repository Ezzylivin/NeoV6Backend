// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";
import { fetchHistoricalNews } from "./newsService.js";

/**
 * -----------------------------
 * STRATEGY PARAMETERS WITH VALIDATION
 * -----------------------------
 */
export const STRATEGY_PARAMS_DESCRIPTION = {
  SMA: {
    fast: { default: 5, description: "Short-term period for SMA", min: 1, max: 50, type: 'number' },
    slow: { default: 20, description: "Long-term period for SMA", min: 5, max: 200, type: 'number' }
  },
  EMA: {
    fast: { default: 8, description: "Fast EMA period", min: 1, max: 50, type: 'number' },
    slow: { default: 21, description: "Slow EMA period", min: 5, max: 200, type: 'number' }
  },
  RSI: {
    period: { default: 14, description: "RSI calculation period", min: 5, max: 50, type: 'number' },
    oversold: { default: 30, description: "Oversold threshold", min: 0, max: 50, type: 'number' },
    overbought: { default: 70, description: "Overbought threshold", min: 50, max: 100, type: 'number' }
  },
  MACD: {
    fast: { default: 12, description: "MACD fast period", min: 5, max: 50, type: 'number' },
    slow: { default: 26, description: "MACD slow period", min: 10, max: 100, type: 'number' },
    signal: { default: 9, description: "MACD signal period", min: 1, max: 50, type: 'number' }
  },
  BOLLINGERBANDS: {
    period: { default: 20, description: "Bollinger Bands period", min: 5, max: 100, type: 'number' },
    multiplier: { default: 2, description: "Standard deviation multiplier", min: 1, max: 5, type: 'number' }
  },
  STOCHASTIC: {
    kPeriod: { default: 14, description: "%K period", min: 5, max: 50, type: 'number' },
    dPeriod: { default: 3, description: "%D period", min: 1, max: 20, type: 'number' },
    oversold: { default: 20, description: "Oversold level", min: 0, max: 50, type: 'number' },
    overbought: { default: 80, description: "Overbought level", min: 50, max: 100, type: 'number' }
  },
  VWAP: {
    period: { default: 20, description: "VWAP calculation period", min: 5, max: 100, type: 'number' }
  },
  ATR: {
    period: { default: 14, description: "ATR calculation period", min: 5, max: 50, type: 'number' },
    multiplier: { default: 2, description: "ATR stop loss multiplier", min: 1, max: 5, type: 'number' }
  }
};

/**
 * -----------------------------
 * IMPROVED TECHNICAL INDICATORS
 * -----------------------------
 */

// Simple Moving Average
const SMA = (values, period, index) => {
  if (index < period - 1) return null;
  const slice = values.slice(index - period + 1, index + 1);
  return slice.reduce((sum, val) => sum + val, 0) / period;
};

// Exponential Moving Average
const EMA = (values, period, index) => {
  if (index < period - 1) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = values[index - period + 1]; // Start with SMA
  
  for (let i = index - period + 2; i <= index; i++) {
    ema = (values[i] * multiplier) + (ema * (1 - multiplier));
  }
  return ema;
};

// Relative Strength Index
const RSI = (values, period, index) => {
  if (index < period) return null;
  
  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
};

// MACD with proper signal calculation
const MACD = (values, fastPeriod, slowPeriod, signalPeriod, index) => {
  if (index < slowPeriod + signalPeriod - 1) return null;
  
  const fastEMA = EMA(values, fastPeriod, index);
  const slowEMA = EMA(values, slowPeriod, index);
  
  if (!fastEMA || !slowEMA) return null;
  
  const macdLine = fastEMA - slowEMA;
  
  // Calculate signal line (EMA of MACD line)
  const macdValues = [];
  for (let i = index - signalPeriod + 1; i <= index; i++) {
    const fEMA = EMA(values, fastPeriod, i);
    const sEMA = EMA(values, slowPeriod, i);
    if (fEMA && sEMA) {
      macdValues.push(fEMA - sEMA);
    }
  }
  
  if (macdValues.length < signalPeriod) return null;
  
  const signalLine = macdValues.reduce((sum, val) => sum + val, 0) / macdValues.length;
  const histogram = macdLine - signalLine;
  
  return { macd: macdLine, signal: signalLine, histogram };
};

// Standard Deviation
const STDEV = (values, period, index) => {
  if (index < period - 1) return null;
  const slice = values.slice(index - period + 1, index + 1);
  const mean = slice.reduce((sum, val) => sum + val, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
  return Math.sqrt(variance);
};

// Stochastic Oscillator
const STOCHASTIC = (candles, kPeriod, dPeriod, index) => {
  if (index < kPeriod - 1) return null;
  
  const slice = candles.slice(index - kPeriod + 1, index + 1);
  const highestHigh = Math.max(...slice.map(c => c.high));
  const lowestLow = Math.min(...slice.map(c => c.low));
  
  const currentClose = candles[index].close;
  const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  
  // Calculate %D (SMA of %K)
  if (index < kPeriod + dPeriod - 2) return { k, d: null };
  
  const kValues = [];
  for (let i = index - dPeriod + 1; i <= index; i++) {
    const tempSlice = candles.slice(i - kPeriod + 1, i + 1);
    const tempHigh = Math.max(...tempSlice.map(c => c.high));
    const tempLow = Math.min(...tempSlice.map(c => c.low));
    const tempK = ((candles[i].close - tempLow) / (tempHigh - tempLow)) * 100;
    kValues.push(tempK);
  }
  
  const d = kValues.reduce((sum, val) => sum + val, 0) / dPeriod;
  return { k, d };
};

// Volume Weighted Average Price
const VWAP = (candles, period, index) => {
  if (index < period - 1) return null;
  
  let totalPV = 0, totalVolume = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const volume = candles[i].volume || 1;
    totalPV += typicalPrice * volume;
    totalVolume += volume;
  }
  
  return totalVolume > 0 ? totalPV / totalVolume : null;
};

// Average True Range
const ATR = (candles, period, index) => {
  if (index < period) return null;
  
  const trueRanges = [];
  for (let i = index - period + 1; i <= index; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  return trueRanges.reduce((sum, tr) => sum + tr, 0) / period;
};

/**
 * -----------------------------
 * STRATEGY EXECUTION WITH BETTER LOGIC
 * -----------------------------
 */
function executeStrategy(strategyType, candles, index, params = {}) {
  try {
    const prices = candles.map(c => c.close);
    const currentPrice = prices[index];
    
    // Merge with default parameters
    const strategyDefaults = STRATEGY_PARAMS_DESCRIPTION[strategyType?.toUpperCase()] || {};
    const mergedParams = {};
    
    Object.keys(strategyDefaults).forEach(key => {
      mergedParams[key] = params[key] ?? strategyDefaults[key].default;
    });

    switch ((strategyType || "").toUpperCase()) {
      case "SMA": {
        const fastSMA = SMA(prices, mergedParams.fast, index);
        const slowSMA = SMA(prices, mergedParams.slow, index);
        
        if (!fastSMA || !slowSMA) return null;
        
        // Cross-over strategy with momentum check
        const prevFastSMA = SMA(prices, mergedParams.fast, index - 1);
        const prevSlowSMA = SMA(prices, mergedParams.slow, index - 1);
        
        if (!prevFastSMA || !prevSlowSMA) return null;
        
        const currentCross = fastSMA > slowSMA;
        const prevCross = prevFastSMA > prevSlowSMA;
        
        if (currentCross && !prevCross) return "BUY";  // Golden cross
        if (!currentCross && prevCross) return "SELL"; // Death cross
        
        return null;
      }

      case "EMA": {
        const fastEMA = EMA(prices, mergedParams.fast, index);
        const slowEMA = EMA(prices, mergedParams.slow, index);
        
        if (!fastEMA || !slowEMA) return null;
        
        const prevFastEMA = EMA(prices, mergedParams.fast, index - 1);
        const prevSlowEMA = EMA(prices, mergedParams.slow, index - 1);
        
        if (!prevFastEMA || !prevSlowEMA) return null;
        
        const currentCross = fastEMA > slowEMA;
        const prevCross = prevFastEMA > prevSlowEMA;
        
        if (currentCross && !prevCross) return "BUY";
        if (!currentCross && prevCross) return "SELL";
        
        return null;
      }

      case "RSI": {
        const rsi = RSI(prices, mergedParams.period, index);
        if (!rsi) return null;
        
        const prevRSI = RSI(prices, mergedParams.period, index - 1);
        if (!prevRSI) return null;
        
        // RSI reversal strategy
        if (prevRSI <= mergedParams.oversold && rsi > mergedParams.oversold) return "BUY";
        if (prevRSI >= mergedParams.overbought && rsi < mergedParams.overbought) return "SELL";
        
        return null;
      }

      case "MACD": {
        const macd = MACD(prices, mergedParams.fast, mergedParams.slow, mergedParams.signal, index);
        if (!macd) return null;
        
        const prevMACD = MACD(prices, mergedParams.fast, mergedParams.slow, mergedParams.signal, index - 1);
        if (!prevMACD) return null;
        
        // MACD signal line crossover
        const currentBullish = macd.macd > macd.signal;
        const prevBullish = prevMACD.macd > prevMACD.signal;
        
        if (currentBullish && !prevBullish) return "BUY";
        if (!currentBullish && prevBullish) return "SELL";
        
        return null;
      }

      case "BOLLINGERBANDS": {
        const sma = SMA(prices, mergedParams.period, index);
        const stdev = STDEV(prices, mergedParams.period, index);
        
        if (!sma || !stdev) return null;
        
        const upperBand = sma + (mergedParams.multiplier * stdev);
        const lowerBand = sma - (mergedParams.multiplier * stdev);
        
        if (currentPrice <= lowerBand) return "BUY";   // Price touches lower band
        if (currentPrice >= upperBand) return "SELL";  // Price touches upper band
        
        return null;
      }

      case "STOCHASTIC": {
        const stoch = STOCHASTIC(candles, mergedParams.kPeriod, mergedParams.dPeriod, index);
        if (!stoch || stoch.d === null) return null;
        
        const prevStoch = STOCHASTIC(candles, mergedParams.kPeriod, mergedParams.dPeriod, index - 1);
        if (!prevStoch || prevStoch.d === null) return null;
        
        // %K crosses above %D in oversold region
        if (stoch.k > stoch.d && prevStoch.k <= prevStoch.d && stoch.k < mergedParams.overbought) return "BUY";
        // %K crosses below %D in overbought region  
        if (stoch.k < stoch.d && prevStoch.k >= prevStoch.d && stoch.k > mergedParams.oversold) return "SELL";
        
        return null;
      }

      case "VWAP": {
        const vwap = VWAP(candles, mergedParams.period, index);
        if (!vwap) return null;
        
        const prevVWAP = VWAP(candles, mergedParams.period, index - 1);
        const prevPrice = prices[index - 1];
        
        if (!prevVWAP) return null;
        
        // Price crosses VWAP
        if (currentPrice > vwap && prevPrice <= prevVWAP) return "BUY";
        if (currentPrice < vwap && prevPrice >= prevVWAP) return "SELL";
        
        return null;
      }

      case "ATR": {
        const atr = ATR(candles, mergedParams.period, index);
        if (!atr) return null;
        
        const prevATR = ATR(candles, mergedParams.period, index - 1);
        if (!prevATR) return null;
        
        // ATR-based volatility breakout
        const atrThreshold = currentPrice * 0.02; // 2% threshold
        
        if (atr > prevATR && atr > atrThreshold) {
          return currentPrice > prices[index - 1] ? "BUY" : "SELL";
        }
        
        return null;
      }

      default:
        // Simple price momentum fallback
        if (index < 1) return null;
        return currentPrice > prices[index - 1] ? "BUY" : "SELL";
    }
  } catch (error) {
    console.error(`Strategy execution error for ${strategyType}:`, error);
    return null;
  }
}

/**
 * -----------------------------
 * ENHANCED REALISM HELPERS
 * -----------------------------
 */
function applySpread(price, spreadPct = 0.1) {
  const spread = spreadPct / 100;
  return {
    buy: price * (1 + spread / 2),
    sell: price * (1 - spread / 2)
  };
}

function applySlippage(price, slippageBps = 5, orderSize = 1) {
  // More realistic slippage based on order size
  const baseSlippage = slippageBps / 10000;
  const sizeMultiplier = Math.min(1 + (orderSize / 10000), 2); // Cap at 2x
  const randomFactor = 0.5 + (Math.random() * 0.5); // 0.5 to 1.0
  
  return price * (1 + baseSlippage * sizeMultiplier * randomFactor);
}

function calculateCommission(orderValue, commissionRate = 0.001) {
  return orderValue * commissionRate; // 0.1% default commission
}

/**
 * -----------------------------
 * IMPROVED POSITION MANAGEMENT
 * -----------------------------
 */
class PositionManager {
  constructor(initialBalance, risk = "Medium", stopLoss = null, takeProfit = null) {
    this.balance = initialBalance;
    this.initialBalance = initialBalance;
    this.position = 0;
    this.positionValue = 0;
    this.entryPrice = 0;
    this.risk = risk;
    this.stopLoss = stopLoss;
    this.takeProfit = takeProfit;
    this.trades = [];
    this.equityCurve = [];
  }

  getRiskMultiplier() {
    switch (this.risk) {
      case "Low": return 0.5;
      case "High": return 2.0;
      default: return 1.0; // Medium
    }
  }

  calculatePositionSize(price, stopLossPrice = null) {
    const riskAmount = this.getTotalValue() * 0.02 * this.getRiskMultiplier(); // 2% base risk
    
    if (stopLossPrice) {
      const riskPerShare = Math.abs(price - stopLossPrice);
      return Math.min(riskAmount / riskPerShare, this.balance);
    }
    
    return this.balance * 0.95; // Use 95% of available balance
  }

  getTotalValue() {
    return this.balance + this.positionValue;
  }

  openPosition(signal, price, timestamp, tradeConfig = {}) {
    if (this.position !== 0) return false; // Already in position
    
    const { useSpread = true, useSlippage = true, useCommission = true } = tradeConfig;
    
    let executionPrice = price;
    if (useSpread) {
      const spread = applySpread(price, tradeConfig.spreadPct || 0.1);
      executionPrice = signal === "BUY" ? spread.buy : spread.sell;
    }
    
    if (useSlippage) {
      executionPrice = applySlippage(executionPrice, tradeConfig.slippageBps || 5);
    }

    const positionSize = this.calculatePositionSize(executionPrice);
    let commission = 0;
    
    if (useCommission) {
      commission = calculateCommission(positionSize, tradeConfig.commissionRate || 0.001);
    }

    if (positionSize + commission > this.balance) return false;

    this.position = (positionSize - commission) / executionPrice;
    this.positionValue = this.position * executionPrice;
    this.balance -= positionSize;
    this.entryPrice = executionPrice;

    this.trades.push({
      entryTime: timestamp,
      entryPrice: executionPrice,
      position: signal === "BUY" ? "long" : "short",
      size: this.position,
      commission: commission
    });

    return true;
  }

  closePosition(price, timestamp, tradeConfig = {}) {
    if (this.position === 0) return false;

    const { useSpread = true, useSlippage = true, useCommission = true } = tradeConfig;
    
    let executionPrice = price;
    if (useSpread) {
      const spread = applySpread(price, tradeConfig.spreadPct || 0.1);
      executionPrice = this.trades[this.trades.length - 1].position === "long" ? spread.sell : spread.buy;
    }
    
    if (useSlippage) {
      executionPrice = applySlippage(executionPrice, tradeConfig.slippageBps || 5);
    }

    const orderValue = this.position * executionPrice;
    let commission = 0;
    
    if (useCommission) {
      commission = calculateCommission(orderValue, tradeConfig.commissionRate || 0.001);
    }

    this.balance += orderValue - commission;
    
    const lastTrade = this.trades[this.trades.length - 1];
    const profit = (executionPrice - lastTrade.entryPrice) * this.position - lastTrade.commission - commission;
    
    // Update trade record
    Object.assign(lastTrade, {
      exitTime: timestamp,
      exitPrice: executionPrice,
      profit: profit,
      duration: timestamp - lastTrade.entryTime,
      result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven",
      exitCommission: commission
    });

    this.position = 0;
    this.positionValue = 0;
    this.entryPrice = 0;

    return true;
  }

  shouldStopLoss(currentPrice) {
    if (!this.stopLoss || this.position === 0) return false;
    
    const lastTrade = this.trades[this.trades.length - 1];
    if (!lastTrade) return false;

    const stopPrice = lastTrade.position === "long" 
      ? this.entryPrice * (1 - this.stopLoss)
      : this.entryPrice * (1 + this.stopLoss);

    return lastTrade.position === "long" 
      ? currentPrice <= stopPrice
      : currentPrice >= stopPrice;
  }

  shouldTakeProfit(currentPrice) {
    if (!this.takeProfit || this.position === 0) return false;
    
    const lastTrade = this.trades[this.trades.length - 1];
    if (!lastTrade) return false;

    const targetPrice = lastTrade.position === "long"
      ? this.entryPrice * (1 + this.takeProfit)
      : this.entryPrice * (1 - this.takeProfit);

    return lastTrade.position === "long"
      ? currentPrice >= targetPrice
      : currentPrice <= targetPrice;
  }

  updateEquityCurve(timestamp, currentPrice) {
    let currentValue = this.balance;
    if (this.position !== 0) {
      currentValue += this.position * currentPrice;
    }
    
    this.equityCurve.push({
      timestamp,
      balance: currentValue
    });
  }
}

/**
 * -----------------------------
 * ENHANCED BACKTEST ENGINE
 * -----------------------------
 */
export async function runBacktest({
  userId,
  symbol,
  strategy,
  strategyId,
  timeframe = "1h",
  initialBalance = 10000,
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  limit = 2000,
  startDate,
  endDate,
  tradeConfig = {},
  simulateOnly = false,
}) {
  try {
    // Input validation
    if (!symbol || !strategy) {
      throw new Error("Symbol and strategy are required");
    }

    if (initialBalance <= 0) {
      throw new Error("Initial balance must be positive");
    }

    // Fetch market data
    const candles = await getCachedOHLCV(symbol, startDate, endDate);
    if (!candles || candles.length === 0) {
      throw new Error(`No market data available for ${symbol}`);
    }

    console.log(`Running backtest for ${symbol} with ${candles.length} candles`);

    // Initialize position manager
    const positionManager = new PositionManager(initialBalance, risk, stopLoss, takeProfit);
    
    // Enhanced trade configuration
    const enhancedTradeConfig = {
      useSpread: true,
      useSlippage: true,
      useCommission: true,
      spreadPct: 0.1,
      slippageBps: 5,
      commissionRate: 0.001,
      ...tradeConfig
    };

    // Main backtest loop
    for (let i = 0; i < Math.min(candles.length, limit); i++) {
      const candle = candles[i];
      const currentPrice = candle.close;
      
      // Update equity curve
      positionManager.updateEquityCurve(candle.timestamp, currentPrice);

      // Check stop loss and take profit first
      if (positionManager.shouldStopLoss(currentPrice)) {
        positionManager.closePosition(currentPrice, candle.timestamp, enhancedTradeConfig);
        continue;
      }

      if (positionManager.shouldTakeProfit(currentPrice)) {
        positionManager.closePosition(currentPrice, candle.timestamp, enhancedTradeConfig);
        continue;
      }

      // Get trading signal
      const signal = executeStrategy(strategy?.strategyType || strategy, candles, i, strategy?.params);
      
      if (!signal) continue;

      // Execute trades based on signal
      if (signal === "BUY" && positionManager.position === 0) {
        positionManager.openPosition(signal, currentPrice, candle.timestamp, enhancedTradeConfig);
      } else if (signal === "SELL" && positionManager.position !== 0) {
        positionManager.closePosition(currentPrice, candle.timestamp, enhancedTradeConfig);
      }
    }

    // Close any remaining position
    if (positionManager.position !== 0 && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      positionManager.closePosition(lastCandle.close, lastCandle.timestamp, enhancedTradeConfig);
    }

    // Calculate final metrics
    const finalBalance = positionManager.getTotalValue();
    const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
    
    const winningTrades = positionManager.trades.filter(t => t.result === "win");
    const winRate = positionManager.trades.length > 0 
      ? (winningTrades.length / positionManager.trades.length) * 100 
      : 0;

    const metrics = {
      totalReturn: totalReturn,
      winRate: winRate,
      totalTrades: positionManager.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: positionManager.trades.filter(t => t.result === "loss").length,
      maxDrawdown: calculateMaxDrawdown(positionManager.equityCurve),
      sharpeRatio: calculateSharpeRatio(positionManager.equityCurve),
      profitFactor: calculateProfitFactor(positionManager.trades)
    };

    // Save backtest result (if not simulation)
    if (!simulateOnly) {
      const backtestResult = new Backtest({
        userId,
        symbol: symbol.toUpperCase(),
        timeframe,
        initialBalance,
        finalBalance,
        profit: finalBalance - initialBalance,
        totalTrades: positionManager.trades.length,
        candlesTested: Math.min(candles.length, limit),
        strategy: {
          name: strategy?.name || strategy?.strategyType || "Unknown",
          parameters: strategy?.params || {}
        },
        tradeBreakdown: positionManager.trades,
        equityCurve: positionManager.equityCurve,
        metrics,
        risk,
        takeProfit,
        stopLoss,
        realismConfig: enhancedTradeConfig,
        tradeConfig: enhancedTradeConfig
      });

      await backtestResult.save();
      await logToDb(userId, `Backtest completed for ${symbol}: ${totalReturn.toFixed(2)}% return`);
    }

    return {
      finalBalance,
      totalReturn,
      trades: positionManager.trades,
      equityCurve: positionManager.equityCurve,
      metrics
    };

  } catch (error) {
    console.error("Backtest error:", error);
    throw error;
  }
}

/**
 * -----------------------------
 * METRIC CALCULATION HELPERS
 * -----------------------------
 */
function calculateMaxDrawdown(equityCurve) {
  let maxDrawdown = 0;
  let peak = 0;
  
  for (const point of equityCurve) {
    if (point.balance > peak) {
      peak = point.balance;
    }
    const drawdown = (peak - point.balance) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return maxDrawdown * 100; // Return as percentage
}

function calculateSharpeRatio(equityCurve, riskFreeRate = 0.02) {
  if (equityCurve.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].balance - equityCurve[i-1].balance) / equityCurve[i-1].balance;
    returns.push(ret);
  }
  
  const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length);
  
  return stdDev === 0 ? 0 : (avgReturn - riskFreeRate / 252) / stdDev; // 252 trading days
}

function calculateProfitFactor(trades) {
  const profits = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
  const losses = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
  
  return losses === 0 ? (profits > 0 ? 999 : 1) : profits / losses;
}

/**
 * -----------------------------
 * IMPROVED DATA FETCHING
 * -----------------------------
 */
async function getCachedOHLCV(symbol, startDate, endDate) {
  try {
    const query = { symbol: symbol.toUpperCase() };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    let cached = await Price.find(query).sort({ timestamp: 1 }).lean();
    
    // If no cached data or insufficient data, fetch from API
    if (!cached.length) {
      console.log(`No cached data for ${symbol}, fetching from API...`);
      cached = await fetchOHLCV(symbol, startDate, endDate);
      
      // Cache the fetched data
      if (cached && cached.length > 0) {
        const priceDocuments = cached.map(candle => ({
          symbol: symbol.toUpperCase(),
          timestamp: new Date(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0
        }));
        
        try {
          await Price.insertMany(priceDocuments, { ordered: false });
          console.log(`Cached ${priceDocuments.length} candles for ${symbol}`);
        } catch (insertError) {
          // Ignore duplicate key errors
          if (!insertError.message.includes('duplicate key')) {
            console.warn('Error caching price data:', insertError.message);
          }
        }
      }
    }

    // Ensure data has required fields
    return cached.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open || candle.close,
      high: candle.high || candle.close,
      low: candle.low || candle.close,
      close: candle.close,
      volume: candle.volume || 1,
      price: candle.close // Legacy support
    })).filter(candle => candle.close && candle.close > 0);

  } catch (error) {
    console.error(`Error fetching OHLCV data for ${symbol}:`, error);
    throw new Error(`Failed to fetch market data for ${symbol}: ${error.message}`);
  }
}

/**
 * -----------------------------
 * BATCH BACKTESTING
 * -----------------------------
 */
export async function runBatchBacktests(userId, strategy, strategyConfigs, startDate, endDate, simulateOnly = false) {
  const results = [];
  const errors = [];
  
  console.log(`Starting batch backtest with ${strategyConfigs.length} configurations`);
  
  for (let i = 0; i < strategyConfigs.length; i++) {
    const config = strategyConfigs[i];
    
    try {
      console.log(`Running backtest ${i + 1}/${strategyConfigs.length}:`, config.symbol || 'default');
      
      const result = await runBacktest({
        userId,
        strategy,
        ...config,
        startDate,
        endDate,
        simulateOnly,
      });
      
      results.push({
        config,
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error(`Batch backtest ${i + 1} failed:`, error.message);
      errors.push({
        config,
        success: false,
        error: error.message
      });
      
      results.push({
        config,
        success: false,
        error: error.message,
        finalBalance: config.initialBalance || 10000,
        totalReturn: 0,
        trades: [],
        metrics: {}
      });
    }
  }
  
  if (!simulateOnly && userId) {
    await logToDb(userId, 
      `Batch backtest completed: ${results.filter(r => r.success).length}/${strategyConfigs.length} successful`
    );
  }
  
  return {
    results,
    summary: {
      total: strategyConfigs.length,
      successful: results.filter(r => r.success).length,
      failed: errors.length,
      bestPerformance: results.filter(r => r.success).sort((a, b) => b.totalReturn - a.totalReturn)[0],
      averageReturn: results.filter(r => r.success).reduce((sum, r) => sum + (r.totalReturn || 0), 0) / Math.max(results.filter(r => r.success).length, 1)
    }
  };
}

/**
 * -----------------------------
 * STRATEGY VALIDATION
 * -----------------------------
 */
export function validateStrategyParams(strategyType, params) {
  const strategyDefaults = STRATEGY_PARAMS_DESCRIPTION[strategyType?.toUpperCase()];
  if (!strategyDefaults) {
    return { valid: false, errors: [`Unknown strategy type: ${strategyType}`] };
  }

  const errors = [];
  const validatedParams = {};

  Object.keys(strategyDefaults).forEach(paramName => {
    const paramConfig = strategyDefaults[paramName];
    const value = params[paramName];

    if (value === undefined || value === null) {
      validatedParams[paramName] = paramConfig.default;
    } else {
      const numValue = Number(value);
      
      if (isNaN(numValue)) {
        errors.push(`Parameter ${paramName} must be a number`);
      } else if (numValue < paramConfig.min || numValue > paramConfig.max) {
        errors.push(`Parameter ${paramName} must be between ${paramConfig.min} and ${paramConfig.max}`);
      } else {
        validatedParams[paramName] = numValue;
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    params: validatedParams
  };
}

/**
 * -----------------------------
 * EXPORT HELPER FUNCTIONS
 * -----------------------------
 */
export {
  executeStrategy,
  SMA,
  EMA,
  RSI,
  MACD,
  STOCHASTIC,
  VWAP,
  ATR,
  calculateMaxDrawdown,
  calculateSharpeRatio,
  calculateProfitFactor
};
