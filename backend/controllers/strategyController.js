// File: src/backend/controllers/strategyController.js
import Strategy from "../dbStructure/strategy.js"; // Make sure this exists in your dbStructure

// GET all strategies for a user
export const getStrategies = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const strategies = await Strategy.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, strategies });
  } catch (err) {
    console.error("[Get Strategies Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET a single strategy by ID
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

// CREATE a new strategy
export const createStrategy = async (req, res) => {
  try {
    const { userId, params, name } = req.body;
    if (!userId || !params) return res.status(400).json({ success: false, message: "Missing userId or params" });

    const newStrategy = await Strategy.create({ userId, params, name });
    res.status(201).json({ success: true, strategy: newStrategy });
  } catch (err) {
    console.error("[Create Strategy Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE a strategy
export const updateStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const { params, name } = req.body;

    const updated = await Strategy.findByIdAndUpdate(
      id,
      { params, name },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "Strategy not found" });
    res.json({ success: true, strategy: updated });
  } catch (err) {
    console.error("[Update Strategy Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE a strategy
export const deleteStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Strategy.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Strategy not found" });

    res.json({ success: true, message: "Strategy deleted" });
  } catch (err) {
    console.error("[Delete Strategy Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
