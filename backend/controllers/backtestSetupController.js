// File: backend/controllers/backtestSetupController.js
// NEW: This controller handles all CRUD operations for saved backtest configurations.

import BacktestSetup from "../dbStructure/backtestSetup.js";

// --- Create a new Backtest Setup ---
// --- Create a new Backtest Setup ---
export const createSetup = async (req, res) => {
  try {
    const { name, description, symbol, timeframe, isCombo = false, strategyId, comboConfig } = req.body;
    const userId = req.user._id;

    // Basic validation
    if (!name || !symbol || !timeframe) {
      return res.status(400).json({ message: "Name, symbol, and timeframe are required." });
    }

    // Check for duplicate name for this user
    const existing = await BacktestSetup.findOne({ userId, name });
    if (existing) {
      return res.status(409).json({ message: "A backtest setup with this name already exists." });
    }

    const setupData = {
      userId,
      name,
      description: description || "",
      symbol,
      timeframe,
      isCombo,
    };

    // Add either single strategy or combo config
    if (isCombo) {
      if (
        !comboConfig ||
        !Array.isArray(comboConfig.strategies) ||
        comboConfig.strategies.length < 2 ||
        !comboConfig.combinationRule
      ) {
        return res.status(400).json({
          message: "Combo config must include at least 2 strategies and a combinationRule.",
        });
      }

      // Normalize strategies
      setupData.comboConfig = {
        combinationRule: comboConfig.combinationRule,
        strategies: comboConfig.strategies.map((s) => ({
          strategyId: s.strategyId || null,
          params: s.params || {},
        })),
      };
    } else {
      if (!strategyId) {
        return res.status(400).json({ message: "strategyId is required for a single setup." });
      }
      setupData.strategyId = strategyId;
    }

    const newSetup = await BacktestSetup.create(setupData);
    res.status(201).json(newSetup);
  } catch (err) {
    console.error("Error creating backtest setup:", err);
    res.status(500).json({ message: "Failed to create backtest setup." });
  }
};

// --- Get all of a user's Backtest Setups ---
export const getSetups = async (req, res) => {
  try {
    const userId = req.user._id;
    const setups = await BacktestSetup.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(setups);
  } catch (err) {
    console.error("Error fetching backtest setups:", err);
    res.status(500).json({ message: "Failed to fetch backtest setups." });
  }
};

// --- Get a single Backtest Setup by ID ---
export const getSetupById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const setup = await BacktestSetup.findOne({ _id: id, userId }).lean();
    if (!setup) {
      return res.status(404).json({ message: "Backtest setup not found." });
    }

    res.status(200).json(setup);
  } catch (err) {
    console.error("Error fetching setup by ID:", err);
    res.status(500).json({ message: "Failed to fetch setup." });
  }
};

// --- Delete a Backtest Setup by ID ---
export const deleteSetup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const deletedSetup = await BacktestSetup.findOneAndDelete({ _id: id, userId });
    if (!deletedSetup) {
      return res.status(404).json({ message: "Backtest setup not found." });
    }

    res.status(200).json({ success: true, message: "Backtest setup deleted successfully." });
  } catch (err) {
    console.error("Error deleting backtest setup:", err);
    res.status(500).json({ message: "Failed to delete backtest setup." });
  }
};
