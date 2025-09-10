import Strategy from "../dbStructure/strategy.js";

// Create new strategy
export const createStrategy = async (req, res) => {
  try {
    const { userId, name, description, params, realism } = req.body;

    // Check for required fields
    if (!userId || !name || !params) {
      return res.status(400).json({ success: false, message: "Missing required fields: userId, name, or params" });
    }

    // Create a new strategy
    const newStrategy = new Strategy({
      userId,
      name,
      description,
      params,
      realism,
    });

    await newStrategy.save();
    return res.status(201).json({ success: true, message: "Strategy created", data: newStrategy });
  } catch (err) {
    console.error("Error creating strategy:", err);
    return res.status(500).json({ success: false, message: "Error creating strategy", error: err.message });
  }
};

// Update strategy
export const updateStrategy = async (req, res) => {
  try {
    const { strategyId, name, description, params, realism } = req.body;
    
    // Validate strategy ID
    if (!strategyId) {
      return res.status(400).json({ success: false, message: "Missing strategyId" });
    }

    const strategy = await Strategy.findById(strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, message: "Strategy not found" });
    }

    // Update fields (only if provided)
    strategy.name = name || strategy.name;
    strategy.description = description || strategy.description;
    strategy.params = params || strategy.params;
    strategy.realism = realism || strategy.realism;

    await strategy.save();
    return res.status(200).json({ success: true, message: "Strategy updated", data: strategy });
  } catch (err) {
    console.error("Error updating strategy:", err);
    return res.status(500).json({ success: false, message: "Error updating strategy", error: err.message });
  }
};

// Delete strategy
export const deleteStrategy = async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    // Validate strategyId parameter
    if (!strategyId) {
      return res.status(400).json({ success: false, message: "Missing strategyId parameter" });
    }

    const strategy = await Strategy.findById(strategyId);

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

    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId parameter" });
    }

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
