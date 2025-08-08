import Backtest from '../dbStructure/backtest.js';

// 1. Create and save a new backtest
export const createBacktest = async (req, res) => {
  try {
    const {
      userId,
      timeframe,
      initialBalance,
      strategy,
      tradeBreakdown,
    } = req.body;

    // Create a new Backtest instance
    const newBacktest = new Backtest({
      userId,
      timeframe,
      initialBalance,
      strategy,
      tradeBreakdown,
    });

    // Save to MongoDB (pre-save hook runs here to calculate profit, finalBalance, etc)
    await newBacktest.save();

    res.status(201).json({ message: 'Backtest saved', backtest: newBacktest });
  } catch (error) {
    console.error('[Backtest Save Error]', error);
    res.status(500).json({ message: 'Failed to save backtest' });
  }
};

// 2. Get all backtests for a specific user (with optional filters)
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find backtests by userId, sorted by creation date (newest first)
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(backtests);
  } catch (error) {
    console.error('[Get Backtests Error]', error);
    res.status(500).json({ message: 'Failed to retrieve backtests' });
  }
};
