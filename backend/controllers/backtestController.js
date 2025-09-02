// File: src/backend/controllers/backtestController.js
import { runRealisticBacktest } from '../services/backtestService.js';
import Backtest from '../dbStructure/backtest.js';
import Price from '../dbStructure/price.js';

/**
 * GET /api/backtests/options
 * Provides dropdown values for frontend.
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct('symbol');
    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
        timeframes: ['1m','5m','10m','15m','30m','1h','4h','1d','3d'],
        balances: [100, 300, 500, 1000, 5000, 10000],
        strategies: ['SMA','EMA','RSI','MACD'],
        risks: ['Low','Medium','High'],
        stopLosses: [0.5, 1, 2, 3, 5],
        takeProfits: [1, 2, 3, 5, 10]
      }
    });
  } catch (err) {
    console.error('[Options Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/backtests/run
 * Runs a single simulation and saves result.
 */
export const runAndSaveBacktests = async (req, res) => {
  try {
    const {
      userId,
      exchange = 'coinbasepro',
      symbol,
      timeframe = '1h',
      initialBalance = 1000,
      strategy = { name: 'SMA', parameters: {} },
      stopLoss = 0,
      takeProfit = 0,
      limit = 1000,
      risk = "Medium"
    } = req.body;

    if (!userId || !symbol) {
      return res.status(400).json({ success: false, message: 'Missing userId or symbol' });
    }

    let result;
    try {
      result = await runRealisticBacktest({
        userId,
        exchange,
        symbol,
        timeframe,
        initialBalance,
        strategy,
        stopLoss,
        takeProfit,
        limit,
        risk
      });
    } catch (err) {
      console.warn(`[Backtest Skipped] ${symbol} - ${err.message}`);
      result = {
        saved: null,
        metrics: { finalBalance: initialBalance, netProfit: 0, tradesCount: 0, winRate: 0 },
        equityCurve: [],
        trades: []
      };
    }

    res.status(201).json({
      success: true,
      backtests: result.saved ? [result.saved] : [],
      metrics: result.metrics,
      equityCurve: result.equityCurve,
      trades: result.trades
    });
  } catch (err) {
    console.error('[Backtest Run Error]', err);
    res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

/**
 * POST /api/backtests/batch
 * Runs multiple parameter combos and saves each.
 */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, exchange = 'coinbasepro', paramCombos } = req.body;

    if (!userId || !Array.isArray(paramCombos) || paramCombos.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing params for batch' });
    }

    const results = [];

    for (const params of paramCombos) {
      try {
        const { saved, metrics, equityCurve, trades } = await runRealisticBacktest({
          userId,
          exchange,
          symbol: params.symbol,
          timeframe: params.timeframe || '1h',
          initialBalance: params.initialBalance || 1000,
          strategy: params.strategy || { name: 'SMA', parameters: {} },
          stopLoss: params.stopLoss || 0,
          takeProfit: params.takeProfit || 0,
          limit: params.limit || 1000,
          risk: params.risk || "Medium"
        });

        results.push({ params, metrics, equityCurve, trades, saved });
      } catch (err) {
        console.warn(`[Backtest Skipped] ${params.symbol} - ${err.message}`);
        results.push({
          params,
          metrics: { finalBalance: params.initialBalance || 1000, netProfit: 0, tradesCount: 0, winRate: 0 },
          equityCurve: [],
          trades: [],
          saved: null
        });
      }
    }

    // Pick best by final balance
    let best = null;
    let bestScore = -Infinity;
    for (const r of results) {
      const finalBalance = r.metrics?.finalBalance ?? 0;
      if (finalBalance > bestScore) {
        bestScore = finalBalance;
        best = r.saved;
      }
    }

    res.json({ success: true, results, best });
  } catch (err) {
    console.error('[Batch Backtests Error]', err);
    res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

/**
 * GET /api/backtests/user/:userId
 * Fetches all backtests for a specific user.
 */
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing userId' });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error('[List Backtests Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * ✅ Extra CRUD-style endpoints
 */

// Create a backtest manually (no simulation)
export const createBacktest = async (req, res) => {
  try {
    const { userId, name, parameters, result } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const backtest = new Backtest({
      userId,
      name: name || "Untitled Backtest",
      parameters: parameters || {},
      result: result || {}
    });
    const saved = await backtest.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Error creating backtest:", error);
    res.status(500).json({ message: "Server error while creating backtest" });
  }
};

// Get all backtests (admin/debug)
export const getAllBacktests = async (req, res) => {
  try {
    const backtests = await Backtest.find();
    res.json(backtests);
  } catch (error) {
    console.error("Error fetching backtests:", error);
    res.status(500).json({ message: "Server error while fetching backtests" });
  }
};

export {
  getBacktestOptions,
  runAndSaveBacktests,
  runBatchBacktestsController,
  getUserBacktests,
  createBacktest,
  getAllBacktests
};
