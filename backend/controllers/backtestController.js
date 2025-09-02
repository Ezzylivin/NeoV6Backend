// src/backend/controllers/backtestController.js
import { runRealisticBacktest, runBatchBacktests } from '../services/backtestService.js';
import Backtest from '../dbStructure/backtest.js';
import Price from '../dbStructure/price.js';

/**
 * GET /api/backtests/options
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
 * Body: { userId, exchange, symbol, timeframe, initialBalance, strategy: {name,parameters}, stopLoss, takeProfit }
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
    } = req.body;

    if (!userId || !symbol) return res.status(400).json({ success: false, message: 'Missing userId or symbol' });

    const { saved, metrics, equityCurve, trades } = await runRealisticBacktest({
      userId,
      exchange,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      stopLoss,
      takeProfit,
      limit,
    });

    res.status(201).json({ success: true, backtests: [saved], metrics, equityCurve, trades });
  } catch (err) {
    console.error('[Backtest Run Error]', err);
    res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

/**
 * POST /api/backtests/batch
 * Body: { userId, exchange, paramCombos: [{symbol,timeframe,initialBalance, strategy:{name,parameters}, stopLoss, takeProfit}] }
 */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, exchange = 'coinbasepro', paramCombos } = req.body;
    if (!userId || !Array.isArray(paramCombos) || paramCombos.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing params for batch' });
    }

    const { results, best } = await runBatchBacktests(userId, exchange, paramCombos);

    res.json({ success: true, results, best });
  } catch (err) {
    console.error('[Batch Backtests Error]', err);
    res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
};

/**
 * GET /api/backtests/user/:userId
 * List saved backtests for a user
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
