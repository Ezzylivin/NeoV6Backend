// File: backend/controllers/strategyEngineController.js
// UPGRADED: Ensures the getStrategiesController always returns an array.

import {
    saveStrategyService,
    getStrategiesService,
    runStrategyService
} from '../services/strategyEngineService.js';

// Controller to save a new strategy
export const saveStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const strategyData = req.body;
        const newStrategy = await saveStrategyService(userId, strategyData);
        res.status(201).json(newStrategy);
    } catch (error) {
        console.error('Error saving strategy:', error);
        res.status(400).json({ message: error.message || 'Failed to save strategy.' });
    }
};

// Controller to get all strategies for a user
export const getStrategiesController = async (req, res) => {
    try {
        const userId = req.user.id;
        const strategies = await getStrategiesService(userId);
        
        // --- THIS IS THE FIX ---
        // Ensure that the response is always an array.
        const strategiesArray = Array.isArray(strategies) ? strategies : [strategies];
        
        res.status(200).json(strategiesArray);
    } catch (error) {
        console.error('Error fetching strategies:', error);
        res.status(500).json({ message: 'Failed to fetch strategies.' });
    }
};

// Controller to run a strategy
export const runStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { strategyId, pair, timeframe } = req.body;

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
