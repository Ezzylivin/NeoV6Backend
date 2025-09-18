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

export const runStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        // FIX: Use 'code' instead of 'strategyId' for consistency
        const { code, symbol, timeframe } = req.body;

        if (!code || !symbol || !timeframe) {
            return res.status(400).json({ message: 'code, symbol, and timeframe are required.' });
        }

        // FIX: Pass 'code' to the service function
        const result = await runStrategyService(userId, code, symbol, timeframe);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error running strategy:', error);
        res.status(500).json({ message: 'Failed to run strategy.' });
    }
};
