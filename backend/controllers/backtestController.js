// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";

// --- Helpers ---
const sendResponse = (res, data = {}, message = "Success") => res.status(200).json({ success: true, message, data });
const sendError = (res, error) => res.status(500).json({ success: false, message: error.message || "Internal Server Error" });

// --- Fetch backtest options ---
export const getBacktestOptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const strategies = await Strategy.find({ userId }).select("name params").lean();
    const symbols = ["BTCUSDT","ETHUSDT","SOLUSDT"]; // example
    const timeframes = ["1m","5m","15m","1h","4h","1d"];
    return sendResponse(res, { strategies, symbols, timeframes });
  } catch(err) { sendError(res, err); }
};

// --- Single backtest ---
export const runBacktestController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { strategyId, symbol, timeframe, startDate, endDate, tp, sl } = req.body;
    if (!strategyId) return res.status(400).json({ success: false, message: "strategyId required" });

    const strategy = await Strategy.findById(strategyId).lean();
    if (!strategy) return res.status(404).json({ success:false,message:"Strategy not found"});
    if (strategy.userId.toString() !== userId) return res.status(403).json({ success:false,message:"Unauthorized" });

    const result = await runBacktest({
      userId,
      strategy: { name: strategy.name, params: strategy.params },
      symbol, timeframe, startDate, endDate, tp, sl
    });

    sendResponse(res, result, "Backtest completed");
  } catch(err) { sendError(res, err); }
};

// --- Batch backtest ---
export const runBatchBacktestsController = async (req,res) => {
  try {
    const userId = req.user.id;
    const { configs } = req.body;
    if(!configs || !Array.isArray(configs) || configs.length===0)
      return res.status(400).json({success:false,message:"configs array required"});
    const results = await runBatchBacktests(userId, configs);
    sendResponse(res, results, "Batch backtests completed");
  } catch(err){ sendError(res,err); }
};

// --- Past backtests ---
export const getUserBacktests = async (req,res) => {
  try {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page-1)*limit;
    const backtests = await Backtest.find({ userId }).sort({ createdAt:-1 }).skip(skip).limit(limit).lean();
    const total = await Backtest.countDocuments({ userId });
    sendResponse(res, { backtests, total, page, limit });
  } catch(err){ sendError(res,err); }
};

export const deleteBacktest = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BacktestModel.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Backtest not found' });

    res.json({ message: 'Backtest deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete backtest.' });
  }
};
