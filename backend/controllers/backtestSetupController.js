// File: backend/controllers/backtestSetupController.js
// 🚀 UPGRADE: v2.1 - Wallet-First Compatibility
// 🛠 Fixes: "Cast to ObjectId failed" error for Wallet Users (0x...)

import BacktestSetup from "../dbStructure/backtestSetup.js";

// Helper to reliably get the User ID (Wallet or MongoID) as a String
const getUserId = (req) => {
    if (req.user && req.user.walletAddress) {
        return req.user.walletAddress.toLowerCase();
    }
    return req.user._id.toString();
};

// --- Create a new Backtest Setup ---
export const createSetup = async (req, res) => {
  try {
    const { name, description, symbol, timeframe, isCombo, strategyId, comboConfig, params } = req.body;
    
    // 🛡️ UPGRADE: Safe User ID extraction
    const userId = getUserId(req);

    // Basic validation
    if (!name || !symbol || !timeframe) {
      return res.status(400).json({ message: "Name, symbol, and timeframe are required." });
    }

    const setupData = {
      userId, // Stores "0x123..." or "64b..." as a String
      name,
      description,
      symbol,
      timeframe,
      isCombo,
      params: params || {} // Ensure params object exists
    };

    // Add either the single strategy ID or the combo config
    if (isCombo) {
      if (!comboConfig || !comboConfig.strategyCodes || !comboConfig.combinationRule) {
        return res.status(400).json({ message: "Combo config is missing required fields." });
      }
      setupData.comboConfig = comboConfig;
    } else {
      // For single strategy, we verify the ID exists but store it as a string ref if needed
      if (!strategyId) {
        return res.status(400).json({ message: "Strategy ID is required for a single setup." });
      }
      setupData.strategyId = strategyId;
    }

    const newSetup = await BacktestSetup.create(setupData);
    res.status(201).json(newSetup);

  } catch (err) {
    // Handle duplicate name error gracefully
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A backtest setup with this name already exists.' });
    }
    console.error("Error creating backtest setup:", err);
    res.status(500).json({ message: "Failed to create backtest setup." });
  }
};

// --- Get all of a user's Backtest Setups ---
export const getSetups = async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // 🛡️ UPGRADE: Query using the String ID
    const setups = await BacktestSetup.find({ userId }).sort({ createdAt: -1 }).lean();
    
    res.status(200).json(setups);
  } catch (err) {
    console.error("Error fetching backtest setups:", err);
    res.status(500).json({ message: "Failed to fetch backtest setups." });
  }
};

// --- Get a single Backtest Setup by its ID ---
export const getSetupById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = getUserId(req);

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

// --- Delete a Backtest Setup by its ID ---
export const deleteSetup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

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
