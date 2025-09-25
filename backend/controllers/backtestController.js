// File: backend/controllers/backtestController.js
// Handles single and combined strategy backtests, previews, and backtest management

import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import {
  runStrategyService,
  runCombinedStrategyService,
} from "../services/strategyEngineService.js";
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
import { normalizeSymbol } from "../services/backtestDataService.js";

// --- Single backtest ---
export const runBacktestController = async (req, res) => {
  console.log("[BacktestController] runBacktestController called with:", req.body);
  const { strategyId, symbol, timeframe, startDate, endDate } = req.body;

  try {
    if (!strategyId || !symbol || !timeframe || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required parameters for single backtest." });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const result = await runStrategyService(
      { _id: strategyId },
      { symbol: normalizedSymbol, timeframe, startDate, endDate },
      req.user._id,
      false
    );

    res.json(result);
  } catch (error) {
    console.error("[BacktestController] singleBacktest error:", error);
    res.status(500).json({ message: "An unexpected error occurred during the single backtest." });
  }
};

// --- Combined backtest ---
export const runComboBacktest = async (req, res) => {
  console.log("[BacktestController] runComboBacktest called with:", req.body);

  try {
    const { params } = req.body;

    if (!params) return res.status(400).json({ message: "Missing 'params' object in request body." });

    const {
      combinationRule,
      symbol,
      timeframe,
      startDate,
      endDate,
      strategyParams = [],
    } = params;

    // Validate
    if (!combinationRule || !symbol || !timeframe || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required parameters for combined backtest." });
    }
    if (!Array.isArray(strategyParams) || strategyParams.length < 2) {
      return res.status(400).json({ message: "At least 2 strategies are required for a combined backtest." });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Ensure each strategy has strategyId and params
    const preparedStrategies = [];
    for (const s of strategyParams) {
      let stratObj;
      if (s.strategyId) {
        stratObj = { id: s.strategyId, params: s.params || {} };
      } else if (s.code) {
        const dbStrategy = await Strategy.findOne({ code: s.code, userId: req.user._id }).lean();
        if (!dbStrategy) return res.status(404).json({ message: `Strategy with code "${s.code}" not found.` });
        stratObj = { id: dbStrategy._id, params: dbStrategy.params || {} };
      } else {
        return res.status(400).json({ message: "Invalid strategy object in strategyParams array." });
      }
      preparedStrategies.push(stratObj);
    }

    const result = await runCombinedStrategyService(req.user._id, {
      strategies: preparedStrategies,
      combinationRule,
      symbol: normalizedSymbol,
      timeframe,
      startDate,
      endDate,
    });

    if (!result.combinedResult?.equityCurve?.length) {
      console.warn(`⚠️ Combo backtest returned no trades for symbol ${symbol}`);
    } else {
      console.log(`✅ Combo backtest completed for symbol ${symbol}`);
    }

    res.json(result);
  } catch (error) {
    if (error.message && error.message.includes("Failed to fetch")) {
      return res.status(404).json({
        message: `Market data for the symbol "${req.body?.params?.symbol}" could not be found.`,
      });
    }
    console.error("[BacktestController] combinedBacktest error:", error);
    res.status(500).json({ message: "An unexpected error occurred during the combined backtest." });
  }
};

// --- Preview strategy ---
export const previewStrategyController = async (req, res) => {
  console.log("[BacktestController] previewStrategyController called with:", req.body);
  try {
    const { code, symbol, timeframe, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({ code, userId }).lean();
    if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });

    const normSymbol = normalizeSymbol(symbol);
    const result = await runStrategyService(
      dbStrategy,
      { symbol: normSymbol, timeframe, params: { ...dbStrategy.params, ...params } },
      userId,
      true
    );

    if (!result || !result.candles?.length) {
      console.warn(`⚠️ Preview strategy returned no candles for ${normSymbol}`);
    }

    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes("Failed to fetch")) {
      return res.status(404).json({ message: `Market data for the symbol "${req.body.symbol}" could not be found.` });
    }
    console.error("[BacktestController] previewStrategy error:", err);
    res.status(500).json({ error: "Failed to preview strategy" });
  }
};

// --- Fetch backtest options ---
export const fetchBacktestOptionsController = async (req, res) => {
  console.log("[BacktestController] fetchBacktestOptionsController called");
  try {
    const userId = req.user._id;
    const strategies = await Strategy.find({ userId }).select("_id name code params").lean();

    const symbolSet = new Set(), timeframeSet = new Set();
    strategies.forEach((s) => {
      const p = s.params || {};
      if (p.symbol) Array.isArray(p.symbol) ? p.symbol.forEach(sym => symbolSet.add(sym)) : symbolSet.add(p.symbol);
      if (p.timeframe) Array.isArray(p.timeframe) ? p.timeframe.forEach(tf => timeframeSet.add(tf)) : timeframeSet.add(p.timeframe);
    });

    const exchangeSymbols = await fetchAllExchangeSymbols();
    exchangeSymbols.forEach(sym => symbolSet.add(sym));

    const exchangeParams = await fetchAllExchangeParams();
    exchangeParams.timeframes.forEach(tf => timeframeSet.add(tf));

    res.json({ strategies, symbols: Array.from(symbolSet), timeframes: Array.from(timeframeSet) });
  } catch (err) {
    console.error("[BacktestController] fetchBacktestOptions error:", err);
    res.status(500).json({ error: "Failed to fetch backtest options" });
  }
};

// --- Fetch past backtests ---
export const fetchPastBacktestsController = async (req, res) => {
  console.log("[BacktestController] fetchPastBacktestsController called, page:", req.query.page);
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
    console.error("[BacktestController] fetchPastBacktests error:", err);
    res.status(500).json({ error: "Failed to fetch past backtests" });
  }
};

// --- Get backtest by ID ---
export const getBacktestById = async (req, res) => {
  console.log("[BacktestController] getBacktestById called with ID:", req.params.backtestId);
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const backtest = await Backtest.findOne({ _id: backtestId, userId }).lean();
    if (!backtest) return res.status(404).json({ error: "Backtest not found" });

    res.json(backtest);
  } catch (err) {
    console.error("[BacktestController] getBacktestById error:", err);
    res.status(500).json({ error: "Failed to fetch backtest" });
  }
};

// --- Delete backtest ---
export const deleteBacktestController = async (req, res) => {
  console.log("[BacktestController] deleteBacktestController called with ID:", req.params.backtestId);
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const deleted = await Backtest.findOneAndDelete({ _id: backtestId, userId });
    if (!deleted) return res.status(404).json({ error: "Backtest not found" });

    res.json({ success: true, message: "Backtest deleted successfully" });
  } catch (err) {
    console.error("[BacktestController] deleteBacktest error:", err);
    res.status(500).json({ error: "Failed to delete backtest" });
  }
};
