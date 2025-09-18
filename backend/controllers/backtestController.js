// File: controllers/backtestController.js
import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runStrategyService, runBatchBacktestsService } from "../services/strategyEngineService.js";
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";

// --- Run single backtest ---
export const runBacktestController = async (req, res) => {
  try {
    const { code, pair, timeframe, startDate, endDate, tp, sl, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({ code, userId }).lean();
    if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });

    const result = await runStrategyService({
      userId,
      code: dbStrategy.code,
      pair,
      timeframe,
      startDate,
      endDate,
      tp,
      sl,
      simulateOnly: false,
      params: { ...dbStrategy.params, ...params },
    });

    res.json(result);
  } catch (err) {
    console.error("Error running backtest:", err);
    res.status(500).json({ error: "Failed to run backtest" });
  }
};

// --- Run batch backtests ---
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { code, batchParams } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({ code, userId }).lean();
    if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });

    const results = await runBatchBacktestsService(dbStrategy, batchParams, userId);
    res.json(results);
  } catch (err) {
    console.error("Error running batch backtests:", err);
    res.status(500).json({ error: "Failed to run batch backtests" });
  }
};

// --- Fetch backtest options ---
export const fetchBacktestOptionsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const strategies = await Strategy.find({ userId }).select("_id name code params").lean();

    const symbolSet = new Set();
    const timeframeSet = new Set();
    const takeProfitSet = new Set();
    const stopLossSet = new Set();

    strategies.forEach(s => {
      const p = s.params || {};
      if (p.symbol) Array.isArray(p.symbol) ? p.symbol.forEach(sym => symbolSet.add(sym)) : symbolSet.add(p.symbol);
      if (p.timeframe) Array.isArray(p.timeframe) ? p.timeframe.forEach(tf => timeframeSet.add(tf)) : timeframeSet.add(p.timeframe);
      if (p.takeProfit) Array.isArray(p.takeProfit) ? p.takeProfit.forEach(tp => takeProfitSet.add(tp)) : takeProfitSet.add(p.takeProfit);
      if (p.stopLoss) Array.isArray(p.stopLoss) ? p.stopLoss.forEach(sl => stopLossSet.add(sl)) : stopLossSet.add(p.stopLoss);
    });

    const exchangeSymbols = await fetchAllExchangeSymbols();
    exchangeSymbols.forEach(sym => symbolSet.add(sym));

    const exchangeParams = await fetchAllExchangeParams();
    exchangeParams.timeframes.forEach(tf => timeframeSet.add(tf));
    exchangeParams.takeProfits.forEach(tp => takeProfitSet.add(tp));
    exchangeParams.stopLosses.forEach(sl => stopLossSet.add(sl));

    res.json({
      strategies,
      symbols: Array.from(symbolSet),
      timeframes: Array.from(timeframeSet),
      takeProfits: Array.from(takeProfitSet),
      stopLosses: Array.from(stopLossSet)
    });
  } catch (err) {
    console.error("Error fetching backtest options:", err);
    res.status(500).json({ error: "Failed to fetch backtest options" });
  }
};

// --- Fetch past backtests with pagination ---
export const fetchPastBacktestsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const [backtests, total] = await Promise.all([
      Backtest.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Backtest.countDocuments({ userId }),
    ]);

    res.json({ backtests, total });
  } catch (err) {
    console.error("Error fetching past backtests:", err);
    res.status(500).json({ error: "Failed to fetch past backtests" });
  }
};

// --- Preview strategy ---
export const previewStrategyController = async (req, res) => {
  try {
    const { code, pair, timeframe, startDate, endDate, tp, sl, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({ code, userId }).lean();
    if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });

    const result = await runStrategyService({
      userId,
      code: dbStrategy.code,
      pair,
      timeframe,
      startDate,
      endDate,
      tp,
      sl,
      simulateOnly: true,
      params: { ...dbStrategy.params, ...params },
    });

    res.json(result);
  } catch (err) {
    console.error("Error previewing strategy:", err);
    res.status(500).json({ error: "Failed to preview strategy" });
  }
};

// --- Fetch a single backtest by ID ---
export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const backtest = await Backtest.findOne({
      _id: new mongoose.Types.ObjectId(backtestId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!backtest) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    res.json(backtest);
  } catch (err) {
    console.error("Error fetching backtest by ID:", err);
    res.status(500).json({ error: "Failed to fetch backtest" });
  }
};

// --- Delete a backtest by ID ---
export const deleteBacktestController = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const deleted = await Backtest.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(backtestId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!deleted) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    res.json({ success: true, message: "Backtest deleted successfully" });
  } catch (err) {
    console.error("Error deleting backtest:", err);
    res.status(500).json({ error: "Failed to delete backtest" });
  }
};
