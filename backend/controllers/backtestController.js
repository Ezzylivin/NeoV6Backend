// File: controllers/backtestController.js
// UPGRADED: Now gracefully handles errors when market data for a symbol cannot be found.

import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runStrategyService, runCombinedStrategyService } from "../services/strategyEngineService.js";
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";

export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        const { code, symbol, timeframe, startDate, endDate, tp, sl, params } = req.body;
        
        const dbStrategy = await Strategy.findOne({ code, userId }).lean();
        
        if (!dbStrategy) {
            return res.status(404).json({ message: "Strategy not found" });
        }

        const backtestParams = {
            symbol, timeframe, startDate, endDate, tp, sl,
            params: { ...dbStrategy.params, ...params }
        };

        const result = await runStrategyService(dbStrategy, backtestParams, userId, false);

        res.json(result);
    } catch (err) {
        // ✅ This block now catches the specific data fetching error.
        if (err.message && err.message.includes('Failed to fetch')) {
             // If the error is about fetching data, send a 404 with a clear message.
            return res.status(404).json({ message: `Market data for the symbol "${req.body.symbol}" could not be found. It may not be available on US exchanges.` });
        }
        // For all other errors, send a generic 500 server error.
        console.error("Error running backtest:", err);
        res.status(500).json({ message: "An unexpected error occurred while running the backtest." });
    }
};

export const runComboBacktest = async (req, res) => {
    try {
        const result = await runCombinedStrategyService(req.user._id, req.body);
        res.status(200).json(result);
    } catch (error) {
         // ✅ This block handles the same data fetching error for combo tests.
        if (error.message && error.message.includes('Failed to fetch')) {
            return res.status(404).json({ message: `Market data for the symbol "${req.body.symbol}" could not be found.` });
        }
        console.error("Error running combined backtest:", error);
        res.status(500).json({ message: "An unexpected error occurred during the combined backtest." });
    }
};


// --- Other controller functions (no changes) ---

export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const userId = req.user._id;
        const strategies = await Strategy.find({ userId }).select("_id name code params").lean();
        const symbolSet = new Set(), timeframeSet = new Set(), takeProfitSet = new Set(), stopLossSet = new Set();
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

export const previewStrategyController = async (req, res) => {
    try {
        const { code, symbol, timeframe, params } = req.body;
        const userId = req.user._id;
        const dbStrategy = await Strategy.findOne({ code, userId }).lean();
        if (!dbStrategy) return res.status(404).json({ error: "Strategy not found" });
        const backtestParams = { symbol, timeframe, params: { ...dbStrategy.params, ...params } };
        const result = await runStrategyService(dbStrategy, backtestParams, userId, true);
        res.json(result);
    } catch (err) {
        if (err.message && err.message.includes('Failed to fetch')) {
            return res.status(404).json({ message: `Market data for the symbol "${req.body.symbol}" could not be found.` });
        }
        console.error("Error previewing strategy:", err);
        res.status(500).json({ error: "Failed to preview strategy" });
    }
};

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
