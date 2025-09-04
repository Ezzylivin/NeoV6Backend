import mongoose from "mongoose";
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests, runRealisticBacktest } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

// --- Error Helper ---
const handleError = (res, context, err, status = 500) => {
  console.error(`[${context}]`, err);
  res.status(status).json({ success: false, message: err.message || "Internal server error" });
};

// GET /api/backtests/options
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct("symbol");
    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
        timeframes: ["1m","5m","15m","30m","1h","4h","1d"],
        balances: [100,500,1000,5000,10000],
        strategies: ["SMA","EMA","RSI","MACD","BollingerBands","Stochastic","VWAP","ATR"],
        risks: ["Low","Medium","High"],
        takeProfits: [null,1,2,3,5,10],
        stopLosses: [null,0.5,1,2,3,5]
      }
    });
  } catch (err) { handleError(res, "Options Error", err); }
};

// POST /api/backtests/run
export const runAndSaveBacktests = async (req, res) => {
  try {
    let { userId, symbol, timeframe="1h", initialBalance=1000, strategy={name:"SMA",parameters:{}}, risk="Medium", takeProfit=null, stopLoss=null, limit=2000, startDate, endDate } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) 
      return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    if (!symbol) return res.status(400).json({ success: false, message: "Missing symbol" });

    initialBalance = Number(initialBalance) || 0;
    takeProfit = takeProfit != null ? Number(takeProfit) : null;
    stopLoss = stopLoss != null ? Number(stopLoss) : null;
    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    const { saved, metrics, equityCurve, trades } = await runBacktest({ userId, symbol, timeframe, initialBalance, strategy: normalizedStrategy, risk, takeProfit, stopLoss, limit, startDate, endDate });
    const profit = saved?.profit ?? 0;

    await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)}`);

    res.status(201).json({ success: true, backtest: saved, metrics, equityCurve, trades });
  } catch (err) { handleError(res, "Backtest Run Error", err); }
};

// POST /api/backtests/batch
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    if (!Array.isArray(paramCombos) || !paramCombos.length) return res.status(400).json({ success: false, message: "Missing paramCombos" });

    const CHUNK_SIZE = 50;
    const results = [];
    let best = null;

    for (let i = 0; i < paramCombos.length; i += CHUNK_SIZE) {
      const chunk = paramCombos.slice(i, i + CHUNK_SIZE);
      const { results: chunkResults, best: chunkBest } = await runBatchBacktests(userId, "exchange", chunk);
      results.push(...chunkResults);
      if (!best || (chunkBest.metrics.netProfit > best.metrics.netProfit)) best = chunkBest;
    }

    res.json({ success: true, results, best });
  } catch (err) { handleError(res, "Batch Backtests Error", err); }
};

// GET /api/backtests/user/:userId
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid or missing userId" });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) { handleError(res, "List Backtests Error", err); }
};

// POST /api/backtests/realistic
export const runRealisticBacktestsController = async (req, res) => {
  try {
    let { userId, symbol, timeframe="1h", initialBalance=1000, strategy={name:"SMA",parameters:{}}, risk="Medium", takeProfit=null, stopLoss=null, limit=2000, startDate, endDate } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    if (!symbol) return res.status(400).json({ success: false, message: "Missing symbol" });

    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;
    const { saved, metrics, equityCurve, trades } = await runRealisticBacktest({ userId, symbol, timeframe, initialBalance, strategy: normalizedStrategy, risk, takeProfit, stopLoss, limit, startDate, endDate });

    const profit = saved?.profit ?? 0;
    await logToDb(userId, `[Realistic Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)}`);

    res.status(201).json({ success: true, backtest: saved, metrics, equityCurve, trades });
  } catch (err) { handleError(res, "Realistic Backtest Error", err); }
};
