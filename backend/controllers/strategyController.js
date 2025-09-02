// File: src/backend/controllers/strategyController.js
import Strategy from "../dbStructure/strategy.js";

// --- Get all strategies for a user ---
export const getUserStrategies = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const strategies = await Strategy.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, strategies });
  } catch (err) {
    console.error("[Get Strategies Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get a single strategy by ID ---
export const getStrategyById = async (req, res) => {
  try {
    const { id } = req.params;
    const strategy = await Strategy.findById(id);
    if (!strategy) return res.status(404).json({ success: false, message: "Strategy not found" });

    res.json({ success: true, strategy });
  } catch (err) {
    console.error("[Get StrategyById Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Create or update (upsert) a strategy ---
export const upsertStrategy = async (req, res) => {
  try {
    const { userId, name, params } = req.body;
    if (!userId || !name) return res.status(400).json({ success: false, message: "Missing fields" });

    const strategy = await Strategy.findOneAndUpdate(
      { userId, name },
      { params, name },
      { upsert: true, new: true }
    );

    res.json({ success: true, strategy });
  } catch (err) {
    console.error("[Upsert Strategy Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Delete a strategy ---
export const deleteStrategy = async (req, res) => {
  try {
    const { userId, name } = req.params;
    if (!userId || !name) return res.status(400).json({ success: false, message: "Missing fields" });

    await Strategy.deleteOne({ userId, name });
    res.json({ success: true, message: "Strategy deleted" });
  } catch (err) {
    console.error("[Delete Strategy Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
