// File: backend/controllers/strategyController.js
import Strategy from "../dbStructure/strategy.js";
import mongoose from "mongoose";

// --- Create a new strategy ---
export const createStrategy = async (req, res) => {
  try {
    const { name, description, params, code } = req.body;

    const strategy = await Strategy.create({
      userId: new mongoose.Types.ObjectId(req.user.id), // ensure ObjectId
      name,
      description,
      params,
      code,
    });

    res.json(strategy);
  } catch (err) {
    console.error("Error creating strategy:", err);
    res.status(500).json({ error: "Failed to create strategy" });
  }
};

// --- Get all strategies for user ---
export const getStrategies = async (req, res) => {
  try {
    const strategies = await Strategy.find({
      userId: new mongoose.Types.ObjectId(req.user.id),
    }).lean();

    res.json(strategies);
  } catch (err) {
    console.error("Error fetching strategies:", err);
    res.status(500).json({ error: "Failed to fetch strategies" });
  }
};

// --- Get single strategy by code ---
export const getStrategyByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const strategy = await Strategy.findOne({
      code,
      userId: new mongoose.Types.ObjectId(req.user.id),
    }).lean();

    if (!strategy) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    res.json(strategy);
  } catch (err) {
    console.error("Error fetching strategy:", err);
    res.status(500).json({ error: "Failed to fetch strategy" });
  }
};

// --- Delete strategy ---
export const deleteStrategy = async (req, res) => {
  try {
    const { code } = req.params;

    const deleted = await Strategy.findOneAndDelete({
      code,
      userId: new mongoose.Types.ObjectId(req.user.id),
    });

    if (!deleted) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting strategy:", err);
    res.status(500).json({ error: "Failed to delete strategy" });
  }
};
