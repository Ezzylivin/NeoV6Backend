// File: backend/controllers/backtestController.js
// Handles single and combined strategy backtests

import BacktestService from "../services/backtestService.js";
import { normalizeSymbol } from "../services/backtestDataService.js";

// --- Single backtest ---
export const runSingleBacktest = async (req, res) => {
  const { strategyId, symbol, timeframe, startDate, endDate } = req.body;

  try {
    if (!strategyId || !symbol || !timeframe || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required parameters for single backtest." });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const result = await BacktestService.singleBacktest({
      strategyId,
      symbol: normalizedSymbol,
      timeframe,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error) {
    console.error("[BacktestController] singleBacktest error:", error);
    res.status(500).json({ message: "An unexpected error occurred during the single backtest." });
  }
};

// --- Combined backtest ---
export const runCombinedBacktest = async (req, res) => {
  const { strategyCodes, combinationRule, symbol, timeframe, startDate, endDate } = req.body;

  try {
    if (!strategyCodes || !Array.isArray(strategyCodes) || strategyCodes.length === 0) {
      return res.status(400).json({ message: "strategyCodes array is required for combined backtest." });
    }
    if (!combinationRule || !symbol || !timeframe || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required parameters for combined backtest." });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const result = await BacktestService.combinedBacktest({
      strategyCodes,
      combinationRule,
      symbol: normalizedSymbol,
      timeframe,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error) {
    console.error("[BacktestController] combinedBacktest error:", error);
    res.status(500).json({ message: "An unexpected error occurred during the combined backtest." });
  }
};
