// File: backend/controllers/backtestController.js
// FIXED: Proper symbol normalization, combo backtests handle multiple strategies without invalid "multi" symbol

import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runStrategyService, runCombinedStrategyService } from "../services/strategyEngineService.js";
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
import { normalizeSymbol } from "../services/backtestDataService.js";

export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        let { code, symbol, timeframe, startDate, endDate, tp, sl, params } = req.body;

        const dbStrategy = await Strategy.findOne({ code, userId }).lean();
        if (!dbStrategy) {
            return res.status(404).json({ message: "Strategy not found" });
        }

        // Normalize the actual trading pair symbol
        const normSymbol = normalizeSymbol(symbol);

        const backtestParams = {
            symbol: normSymbol,
            timeframe,
            startDate,
            endDate,
            tp,
            sl,
            params: { ...dbStrategy.params, ...params }
        };

        const result = await runStrategyService(dbStrategy, backtestParams, userId, false);

        // Log candle lengths for debugging
        if (!result || !result.candles || result.candles.length === 0) {
            console.warn(`⚠️ No candles returned for symbol ${normSymbol} and timeframe ${timeframe}`);
        } else {
            console.log(`✅ Backtest candles fetched for ${normSymbol}:`, result.candles.length);
        }

        res.json(result);
    } catch (err) {
        if (err.message && err.message.includes('Failed to fetch')) {
            return res.status(404).json({
                message: `Market data for the symbol "${req.body.symbol}" could not be found. It may not be available on US exchanges.`
            });
        }
        console.error("Error running backtest:", err);
        res.status(500).json({ message: "An unexpected error occurred while running the backtest." });
    }
};

export const runComboBacktest = async (req, res) => {
  try {
    const userId = req.user._id;

    // --- Validate payload ---
    const { strategies, symbols, symbol, timeframe, startDate, endDate, initial_balance } = req.body;

    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ message: "Strategies array is required for combo backtest." });
    }

    const symbolArray = Array.isArray(symbols) ? symbols : symbol ? [symbol] : [];
    if (symbolArray.length === 0) {
      return res.status(400).json({ message: "At least one symbol is required." });
    }

    if (!timeframe) return res.status(400).json({ message: "Timeframe is required." });

    // --- Set default dates if missing ---
    const today = new Date();
    const defaultStart = new Date(today); defaultStart.setFullYear(today.getFullYear() - 1);
    const defaultEnd = new Date(today); defaultEnd.setDate(today.getDate() - 1);

    const start = startDate || defaultStart.toISOString().split('T')[0];
    const end = endDate || defaultEnd.toISOString().split('T')[0];

    // --- Normalize symbols ---
    const normSymbols = symbolArray.map(s => normalizeSymbol(s));

    console.log("✅ Running combo backtest");
    console.log("User:", userId);
    console.log("Strategies:", strategies);
    console.log("Symbols:", normSymbols);
    console.log("Timeframe:", timeframe);
    console.log("Dates:", start, "-", end);
    console.log("Initial balance:", initial_balance);

    // --- Prepare results container ---
    const individualResults = [];
    let combinedEquityCurve = [];

    // --- Run each strategy individually and safely ---
    for (const stratCode of strategies) {
      try {
        const result = await runStrategyService(userId, stratCode, normSymbols[0], timeframe, {
          startDate: start,
          endDate: end,
          initial_balance
        });

        if (!result || !result.equityCurve || result.equityCurve.length === 0) {
          console.warn(`⚠️ No trades returned for strategy ${stratCode}`);
          continue;
        }

        individualResults.push({
          strategyCode: stratCode,
          equityCurve: result.equityCurve,
          metrics: result.metrics || {}
        });

        // --- Merge equity curves for combined result ---
        if (combinedEquityCurve.length === 0) {
          combinedEquityCurve = result.equityCurve.map(c => ({ ...c }));
        } else {
          // Simple sum of equities for combined (can adjust logic)
          combinedEquityCurve = combinedEquityCurve.map((c, idx) => ({
            date: c.date,
            equity: c.equity + (result.equityCurve[idx]?.equity || 0)
          }));
        }
      } catch (err) {
        console.error(`Error running strategy ${stratCode}:`, err.message || err);
      }
    }

    if (individualResults.length === 0) {
      return res.status(400).json({ message: "No valid strategies could be executed." });
    }

    const combinedResult = {
      equityCurve: combinedEquityCurve,
      metrics: {
        initial_balance,
        totalProfit: combinedEquityCurve.length ? combinedEquityCurve[combinedEquityCurve.length-1].equity - initial_balance : 0,
        finalBalance: combinedEquityCurve.length ? combinedEquityCurve[combinedEquityCurve.length-1].equity : initial_balance,
        winRate: 0, // Optional: compute across strategies
        maxDrawdown: 0, // Optional: compute properly
        profitFactor: 0 // Optional: compute properly
      },
      strategies
    };

    console.log("✅ Combo backtest completed");

    res.status(200).json({ combinedResult, individualResults });
  } catch (error) {
    console.error("Error running combined backtest:", error);
    res.status(500).json({ message: "An unexpected error occurred during the combined backtest." });
  }
};

// --- Fetch backtest options ---
export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const userId = req.user._id;
        const strategies = await Strategy.find({ userId }).select("_id name code params").lean();
        const symbolSet = new Set(), timeframeSet = new Set();

        strategies.forEach(s => {
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
        console.error("Error fetching backtest options:", err);
        res.status(500).json({ error: "Failed to fetch backtest options" });
    }
};

// --- Fetch past backtests ---
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
        const { code, symbol, timeframe, params } = req.body;
        const userId = req.user._id;
        const dbStrategy = await Strategy.findOne({ code, userId }).lean();
        if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });

        const normSymbol = normalizeSymbol(symbol);
        const backtestParams = { symbol: normSymbol, timeframe, params: { ...dbStrategy.params, ...params } };
        const result = await runStrategyService(dbStrategy, backtestParams, userId, true);

        if (!result || !result.candles || result.candles.length === 0) {
            console.warn(`⚠️ Preview strategy returned no candles for ${normSymbol}`);
        }

        res.json(result);
    } catch (err) {
        if (err.message && err.message.includes('Failed to fetch')) {
            return res.status(404).json({ message: `Market data for the symbol "${req.body.symbol}" could not be found.` });
        }
        console.error("Error previewing strategy:", err);
        res.status(500).json({ error: "Failed to preview strategy" });
    }
};

// --- Get backtest by ID ---
export const getBacktestById = async (req, res) => {
    try {
        const { backtestId } = req.params;
        const userId = req.user._id;
        const backtest = await Backtest.findOne({ _id: backtestId, userId }).lean();
        if (!backtest) {
            return res.status(404).json({ error: "Backtest not found" });
        }
        res.json(backtest);
    } catch (err) {
        console.error("Error fetching backtest by ID:", err);
        res.status(500).json({ error: "Failed to fetch backtest" });
    }
};

// --- Delete backtest ---
export const deleteBacktestController = async (req, res) => {
    try {
        const { backtestId } = req.params;
        const userId = req.user._id;
        const deleted = await Backtest.findOneAndDelete({ _id: backtestId, userId });
        if (!deleted) {
            return res.status(404).json({ error: "Backtest not found" });
        }
        res.json({ success: true, message: "Backtest deleted successfully" });
    } catch (err) {
        console.error("Error deleting backtest:", err);
        res.status(500).json({ error: "Failed to delete backtest" });
    }
};
