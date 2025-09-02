import { runRealisticBacktest, runBatchBacktests } from '../services/backtestService.js';
import Backtest from '../dbStructure/backtest.js';
import Price from '../dbStructure/price.js';

/* ---------- GET OPTIONS ---------- */
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

/* ---------- SINGLE BACKTEST ---------- */
export const runBacktestController = async (req, res) => {
  try {
    const { userId, strategy, ...params } = req.body;
    if (!userId || !params.symbol) return res.status(400).json({ success: false, message: "Missing userId or symbol" });

    let strat = strategy;
    if (!strat) strat = { name: "SMA", parameters: {} };
    if (typeof strat === "string") strat = { name: strat, parameters: {} };
    if (!strat.parameters) strat.parameters = {};

    const result = await runRealisticBacktest({ userId, strategy: strat, ...params });
    res.status(201).json({ success: true, backtests: [result.saved], metrics: result.metrics, equityCurve: result.equityCurve, trades: result.trades });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
};

/* ---------- BATCH BACKTEST ---------- */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos, exchange = 'coinbasepro' } = req.body;
    if (!userId || !Array.isArray(paramCombos) || !paramCombos.length) {
      return res.status(400).json({ success: false, message: "Missing params for batch" });
    }

    // normalize each param
    const normalized = paramCombos.map(p => {
      if (!p.strategy) p.strategy = { name: "SMA", parameters: {} };
      if (typeof p.strategy === "string") p.strategy = { name: p.strategy, parameters: {} };
      if (!p.strategy.parameters) p.strategy.parameters = {};
      return {
        ...p,
        initialBalance: Number(p.initialBalance) || 1000,
        stopLoss: Number(p.stopLoss) || 0,
        takeProfit: Number(p.takeProfit) || 0,
        timeframe: p.timeframe || '1h',
        limit: Number(p.limit) || 1000,
        risk: p.risk || "Medium"
      };
    });

    const { results, best } = await runBatchBacktests(userId, exchange, normalized);
    res.status(200).json({ success: true, results, best });
  } catch (err) {
    console.error("[Batch Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
};

/* ---------- GET USER BACKTESTS ---------- */
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, backtests });
  } catch (err) {
    console.error("[List Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
};
