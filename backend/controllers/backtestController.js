// File: controllers/backtestController.js
// UPGRADED: Now normalizes symbols, logs fetched candle lengths, ensures combo tests handle multiple symbols,
// and gracefully handles errors when market data for a symbol cannot be found.

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

        // Normalize symbol for multi-exchange compatibility
        const normSymbol = normalizeSymbol('multi', symbol);

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

        // Normalize all symbols in combo payload
        if (Array.isArray(req.body.symbols)) {
            req.body.symbols = req.body.symbols.map(s => normalizeSymbol('multi', s));
        } else if (req.body.symbol) {
            req.body.symbol = normalizeSymbol('multi', req.body.symbol);
        }

        const result = await runCombinedStrategyService(userId, req.body);

        // Log combined candle info for debugging
        if (result.combinedResult?.equityCurve?.length === 0) {
            console.warn(`⚠️ Combo backtest returned no trades for symbols: ${req.body.symbols || req.body.symbol}`);
        } else {
            console.log(`✅ Combo backtest completed for symbols: ${req.body.symbols || req.body.symbol}`);
        }

        res.status(200).json(result);
    } catch (error) {
        if (error.message && error.message.includes('Failed to fetch')) {
            return res.status(404).json({
                message: `Market data for the symbol "${req.body.symbol || req.body.symbols}" could not be found.`
            });
        }
        console.error("Error running combined backtest:", error);
        res.status(500).json({ message: "An unexpected error occurred during the combined backtest." });
    }
};

// --- Other controller functions remain unchanged ---

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

        const normSymbol = normalizeSymbol('multi', symbol);
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
