// File: backend/controllers/strategyController.js
// UPGRADED: Standardized to use _id, improved error handling, and added an update function.

import Strategy from "../dbStructure/strategy.js";

// --- Create a new strategy ---
export const createStrategy = async (req, res) => {
  try {
    const { name, description, params } = req.body;
    const userId = req.user._id;

    // Generate a unique 'code' from the strategy name for user-friendly URLs/keys
    const code = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Check for duplicates before attempting to save
    const existingStrategy = await Strategy.findOne({ code, userId });
    if (existingStrategy) {
      return res.status(409).json({ message: 'A strategy with this name already exists.' });
    }

    const strategy = await Strategy.create({
      userId,
      name,
      description,
      params,
      code,
    });

    res.status(201).json(strategy);
  } catch (err) {
    console.error("Error creating strategy:", err);
    // Provide more context for validation errors if they occur
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: "Validation Error", details: err.message });
    }
    res.status(500).json({ message: "Failed to create strategy due to a server error" });
  }
};

// --- Get all strategies for a user ---
export const getStrategies = async (req, res) => {
  try {
    // Mongoose handles ObjectId casting, so 'new mongoose.Types.ObjectId' is not needed here
    const strategies = await Strategy.find({ userId: req.user._id }).lean();
    res.json(strategies);
  } catch (err) {
    console.error("Error fetching strategies:", err);
    res.status(500).json({ message: "Failed to fetch strategies" });
  }
};

// --- Get a single strategy by its ID ---
export const getStrategyByCode = async (req, res) => {
  try {
    const strategy = await Strategy.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    res.json(strategy);
  } catch (err) {
    console.error("Error fetching strategy:", err);
    res.status(500).json({ message: "Failed to fetch strategy" });
  }
};

    
    // Find the strategy by its ID and the user who owns it
    const strategy = await Strategy.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }



// --- Delete a strategy by its ID ---
export const deleteStrategy = async (req, res) => {
  try {
    const deleted = await Strategy.findOneAndDelete({
      _id: req.params.id, // Switched from 'code' to the unique '_id'
      userId: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    res.status(200).json({ success: true, message: "Strategy deleted successfully" });
  } catch (err) {
    console.error("Error deleting strategy:", err);
    res.status(500).json({ message: "Failed to delete strategy" });
  }
};
