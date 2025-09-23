// File: backend/controllers/comboStrategyController.js
import ComboStrategy from "../dbStructure/comboStrategy.js";

// --- Get all combo strategies for a user ---
export const getComboStrategies = async (req, res) => {
  try {
    const combos = await ComboStrategy.find({ userId: req.user._id })
      .populate("strategies", "name code description") // only return useful fields
      .sort({ createdAt: -1 }); // newest first

    res.json(combos);
  } catch (err) {
    console.error("getComboStrategies error:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch combo strategies", error: err.message });
  }
};

// --- Create a new combo strategy ---
export const createComboStrategy = async (req, res) => {
  try {
    const { name, description, strategies, params } = req.body;

    if (!name?.trim() || !params || typeof params !== "object") {
      return res.status(400).json({ message: "Name and params are required" });
    }

    // Prevent duplicate names for the same user
    const existing = await ComboStrategy.findOne({ userId: req.user._id, name });
    if (existing) {
      return res.status(400).json({ message: "Combo strategy name already exists" });
    }

    const newCombo = new ComboStrategy({
      userId: req.user._id,
      name: name.trim(),
      description: description?.trim() || "",
      strategies: strategies || [],
      params,
    });

    await newCombo.save();
    res.status(201).json(newCombo);
  } catch (err) {
    console.error("createComboStrategy error:", err);
    res
      .status(500)
      .json({ message: "Failed to create combo strategy", error: err.message });
  }
};

// --- Delete a combo strategy ---
export const deleteComboStrategy = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ComboStrategy.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Combo strategy not found" });
    }

    res.json({ message: "Combo strategy deleted successfully" });
  } catch (err) {
    console.error("deleteComboStrategy error:", err);
    res
      .status(500)
      .json({ message: "Failed to delete combo strategy", error: err.message });
  }
};
