// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Price from "../dbStructure/price.js";
import { logToDb } from "../services/logService.js";

// Run and save backtest
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;
    if (!userId || !symbol || !timeframe || !initialBalance) {
      return res.status(400).json({ success:false, message:"Missing required fields" });
    }

    // Fetch historical data
    const historicalData = await Price.find({ symbol }).sort({ timestamp: 1 });
    if (!historicalData.length) return res.status(400).json({ success:false, message:"No historical data" });

    // Simple SMA strategy example
    let balance = Number(initialBalance);
    let asset = 0;
    let trades = [];
    for (let i = 1; i < historicalData.length; i++) {
      const prev = historicalData[i-1].price;
      const curr = historicalData[i].price;
      if(curr > prev && balance > curr) { asset += balance / curr; balance = 0; trades.push({entryTime: historicalData[i-1].timestamp, exitTime: historicalData[i].timestamp, entryPrice: prev, exitPrice: curr, position:"long", profit: curr-prev, result:"win", duration: (historicalData[i].timestamp - historicalData[i-1].timestamp)/60000 }); }
      else if(curr < prev && asset > 0) { balance += asset * curr; asset = 0; trades.push({entryTime: historicalData[i-1].timestamp, exitTime: historicalData[i].timestamp, entryPrice: prev, exitPrice: curr, position:"short", profit: prev-curr, result:"win", duration:(historicalData[i].timestamp - historicalData[i-1].timestamp)/60000 }); }
    }

    const finalBalance = balance + asset * historicalData[historicalData.length-1].price;

    const backtestResult = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      finalBalance,
      profit: finalBalance - initialBalance,
      totalTrades: trades.length,
      candlesTested: historicalData.length,
      strategy: { name: strategy, parameters:{} },
      tradeBreakdown: trades,
      risk,
    });

    await logToDb(userId, `[Backtest] ${symbol} | Strategy: ${strategy} | Profit: $${(finalBalance - initialBalance).toFixed(2)}`);
    res.status(201).json({ success:true, backtests:[backtestResult] });

  } catch(err) {
    console.error("[Backtest Error]", err);
    res.status(500).json({ success:false, message:"Failed to run backtest" });
  }
};

// Fetch dropdown options
export const getBacktestOptions = (req,res)=>{
  try{
    const options = {
      symbols:["BTCUSDT","ETHUSDT","BNBUSDT"],
      timeframes:["1m","5m","15m","1h","4h","1d"],
      balances:[100,500,1000,5000],
      strategies:["SMA","EMA","RSI","MACD"],
      risks:["Low","Medium","High"]
    };
    res.json({ success:true, options });
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, message:err.message });
  }
};
