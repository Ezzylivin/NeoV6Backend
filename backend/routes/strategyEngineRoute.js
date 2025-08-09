import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

// Import the new controller functions
import {
  saveStrategyController,
  getStrategiesController,
  runStrategyController
} from '../controllers/strategyEngineController.js';

const router = express.Router();

// The routes now point to the controller functions, not the service functions.

// @route   POST /api/strategy
// @desc    Save a new strategy configuration
// @access  Private
router.post('/strategy', protect, saveStrategyController);

// @route   GET /api/strategy
// @desc    Get all strategies for the logged-in user
// @access  Private
router.get('/strategy', protect, getStrategiesController);

// @route   POST /api/strategy/run
// @desc    Run a specific strategy to get a decision
// @access  Private
router.post('/strategy/run', protect, runStrategyController);

export default router;
