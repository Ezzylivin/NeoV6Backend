import {
  saveStrategyService,
  getStrategiesService,
  runStrategyService
} from '../services/strategyService.js';

// Controller to save a new strategy
export const saveStrategyController = async (req, res) => {
  try {
    const userId = req.user.id; // From 'protect' middleware
    const strategyData = req.body; // e.g., { name: 'My Crossover', params: { fast: 10, slow: 30 } }

    const newStrategy = await saveStrategyService(userId, strategyData);
    res.status(201).json(newStrategy);

  } catch (error) {
    console.error('Error saving strategy:', error);
    // Send a more specific error if possible
    res.status(400).json({ message: error.message || 'Failed to save strategy.' });
  }
};

// Controller to get all strategies for a user
export const getStrategiesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const strategies = await getStrategiesService(userId);
    res.status(200).json(strategies);

  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ message: 'Failed to fetch strategies.' });
  }
};

// Controller to run a strategy (e.g., as part of a backtest or live bot)
export const runStrategyController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { strategyId, pair, timeframe } = req.body; // Data needed to run

    if (!strategyId || !pair || !timeframe) {
      return res.status(400).json({ message: 'strategyId, pair, and timeframe are required.' });
    }

    const result = await runStrategyService(userId, strategyId, pair, timeframe);
    res.status(200).json(result);

  } catch (error) {
    console.error('Error running strategy:', error);
    res.status(500).json({ message: 'Failed to run strategy.' });
  }
};
