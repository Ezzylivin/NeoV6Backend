// File: backend/controllers/backtestController.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "../services/logService.js";

// --- Strategy helpers ---
function calculateSMA(data, period = 14) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, c) => acc + c.close, 0);
    return +(sum / period).toFixed(2);
  });
}

function calculateEMA(data, period = 14) {
  const k = 2 / (period + 1);
  let emaArray = [];
  data.forEach((c, i) => {
    if (i === 0) emaArray.push(c.close);
    else emaArray.push(+(c.close * k + emaArray[i - 1] * (1 - k)).toFixed(2));
  });
  return emaArray;
}

function calculateRSI(data, period = 14) {
  let gains = [], losses = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  let rsi = Array(period).fill(null);
  for (let i = period; i < data.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((a,b)=>a+b,0)/period;
    const avgLoss = losses.slice(i - period, i).reduce((a,b)=>a+b,0)/period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(+(100 - 100 / (1 + rs)).toFixed(2));
  }
  return rsi;
}

function calculateMACD(data, fast=12, slow=26, signal=9) {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine = emaFast.map((v,i) => (v - emaSlow[i]).toFixed(2));
  const signalLine = calculateEMA(macdLine.map(v=>({close:parseFloat(v)})), signal);
  return { macdLine, signalLine };
}

// --- Strategy execution ---
function runStrategy(data, strategyName) {
  if (!Array.isArray(data) || data.length < 2) return { trades: [], finalBalance: 0 };

  const trades = [];
  let balance = 1000; // default, overwritten later
  let asset = 0;

  try {
    switch(strategyName) {
      case "SMA": {
        const sma = calculateSMA(data, 14);
        for (let i = 1; i < data.length; i++) {
          if (!sma[i] || !sma[i-1]) continue;
          if (data[i-1].close < sma[i-1] && data[i].close > sma[i]) {
            asset += balance / data[i].close; balance = 0;
            trades.push({ entryTime:data[i-1].timestamp, exitTime:data[i].timestamp, entryPrice:data[i-1].close, exitPrice:data[i].close, position:"long", profit: +(data[i].close-data[i-1].close).toFixed(2), result:"win", duration:(data[i].timestamp-data[i-1].timestamp)/60000 });
          } else if (data[i-1].close > sma[i-1] && data[i].close < sma[i] && asset > 0) {
            balance += asset * data[i].close; asset = 0;
            trades.push({ entryTime:data[i-1].timestamp, exitTime:data[i].timestamp, entryPrice:data[i-1].close, exitPrice:data[i].close, position:"short", profit: +(data[i-1].close-data[i].close).toFixed(2), result:"win", duration:(data[i].timestamp-data[i-1].timestamp)/60000 });
          }
        }
        break;
      }
      case "EMA": {
        const ema = calculateEMA(data, 14);
        for (let i = 1; i < data.length; i++) {
          if (!ema[i] || !ema[i-1]) continue;
          if (data[i-1].close < ema[i-1] && data[i].close > ema[i]) { asset += balance / data[i].close; balance = 0; }
          else if (data[i-1].close > ema[i-1] && data[i].close < ema[i] && asset > 0) { balance += asset * data[i].close; asset = 0; }
        }
        break;
      }
      case "RSI": {
        const rsi = calculateRSI(data, 14);
        for (let i = 1; i < data.length; i++) {
          if (!rsi[i]) continue;
          if (rsi[i] < 30 && balance > 0) { asset += balance / data[i].close; balance = 0; }
          else if (rsi[i] > 70 && asset > 0) { balance += asset * data[i].close; asset = 0; }
        }
        break;
      }
      case "MACD": {
        const { macdLine, signalLine } = calculateMACD(data);
        for (let i = 1; i < data.length; i++) {
          if (!macdLine[i] || !signalLine[i]) continue;
          if (macdLine[i-1] < signalLine[i-1] && macdLine[i] > signalLine[i]) { asset += balance / data[i].close; balance = 0; }
          else if (macdLine[i-1] > signalLine[i-1] && macdLine[i] < signalLine[i] && asset > 0) { balance += asset * data[i].close; asset = 0; }
        }
        break;
      }
      default:
        break;
    }

    const finalBalance = balance + asset * (data[data.length-1]?.close || 0);
    return { trades, finalBalance };
  } catch(err) {
    console.error("[Strategy Execution Error]", err);
    return { trades: [], finalBalance: 0 };
  }
}

// --- Controller ---
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    if (!userId || !symbol || !timeframe || initialBalance == null) {
      return res.status(400).json({ success:false, message:"Missing required fields" });
    }

    // Fetch historical data
    const historicalData = await Price.find({ symbol }).sort({ timestamp: 1 });
    if (!historicalData.length) {
      return res.status(400).json({ success:false, message:"No historical data available for this symbol" });
    }

    // Run strategy
    const { trades, finalBalance } = runStrategy(historicalData, strategy);
    const totalProfit = +(finalBalance - initialBalance).toFixed(2);

    // Save backtest
    const backtestResult = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      finalBalance,
      profit: totalProfit,
      totalTrades: trades.length,
      candlesTested: historicalData.length,
      strategy: { name: strategy, parameters: {} },
      tradeBreakdown: trades,
      risk: risk || "Medium",
    });

    await logToDb(userId, `[Backtest] ${symbol} | Strategy: ${strategy} | Profit: $${totalProfit}`);

    res.status(201).json({ success:true, backtests:[backtestResult] });

  } catch(err) {
    console.error("[Backtest Internal Error]", err);
    res.status(500).json({ success:false, message:err.message || "Internal server error during backtest" });
  }
};

// --- Options ---
export const getBacktestOptions = (req,res)=>{
  try{
    const options = {
      symbols: ["BTCUSDT","ETHUSDT","BNBUSDT"],
      timeframes:["1m","5m","15m","1h","4h","1d"],
      balances:[100,500,1000,5000],
      strategies:["SMA","EMA","RSI","MACD"],
      risks:["Low","Medium","High"]
    };
    res.json({ success:true, options });
  }catch(err){
    console.error("[Options Error]", err);
    res.status(500).json({ success:false, message:err.message });
  }
};
