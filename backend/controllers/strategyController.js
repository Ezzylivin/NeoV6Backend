// File: src/backend/controllers/strategyController.js
import Strategy from "../dbStructure/strategy.js";

// Create or Update strategy (Upsert)
export const upsertStrategy = async (req, res) => {
  try {
    const { userId, name, description, params, realism } = req.body;

    if (!userId || !name || !params) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    let strategy = await Strategy.findOne({ name, userId });

    if (!strategy) {
      // Create new strategy if not found
      strategy = new Strategy({
        userId,
        name,
        description,
        params,
        realism,
      });
    } else {
      // Update strategy if it exists
      strategy.name = name;
      strategy.description = description;
      strategy.params = params;
      strategy.realism = realism;
    }

    await strategy.save();
    return res.status(201).json({ success: true, message: "Strategy created/updated", data: strategy });
  } catch (err) {
    console.error("Error upserting strategy:", err);
    return res.status(500).json({ success: false, message: "Error upserting strategy", error: err.message });
  }
};

// Get a strategy by ID
export const getStrategyById = async (req, res) => {
  try {
    const { id } = req.params;
    const strategy = await Strategy.findById(id);

    if (!strategy) {
      return res.status(404).json({ success: false, message: "Strategy not found" });
    }

    return res.status(200).json({ success: true, data: strategy });
  } catch (err) {
    console.error("Error fetching strategy by ID:", err);
    return res.status(500).json({ success: false, message: "Error fetching strategy by ID", error: err.message });
  }
};

// Delete a strategy
export const deleteStrategy = async (req, res) => {
  try {
    const { userId, name } = req.params;
    const strategy = await Strategy.findOne({ userId, name });

    if (!strategy) {
      return res.status(404).json({ success: false, message: "Strategy not found" });
    }

    await strategy.remove();
    return res.status(200).json({ success: true, message: "Strategy deleted" });
  } catch (err) {
    console.error("Error deleting strategy:", err);
    return res.status(500).json({ success: false, message: "Error deleting strategy", error: err.message });
  }
};

// Get all strategies for the user
export const getUserStrategies = async (req, res) => {
  try {
    const { userId } = req.params;
    const strategies = await Strategy.find({ userId });

    if (!strategies || strategies.length === 0) {
      return res.status(404).json({ success: false, message: "No strategies found for this user" });
    }

    return res.status(200).json({ success: true, data: strategies });
  } catch (err) {
    console.error("Error fetching strategies:", err);
    return res.status(500).json({ success: false, message: "Error fetching strategies", error: err.message });
  }
};
