import ComboStrategy from "../dbStructure/comboStrategy.js";

// Get all combo strategies for a user
export const getComboStrategies = async (req, res) => {
  try {
    const combos = await ComboStrategy.find({ userId: req.user._id })
      .populate("strategies"); // Optional: populate strategy details
    res.json(combos);
  } catch (err) {
    console.error("getComboStrategies error:", err);
    res.status(500).json({ message: "Failed to fetch combo strategies" });
  }
};

// Create a new combo strategy
export const createComboStrategy = async (req, res) => {
  try {
    const { name, description, strategies, params } = req.body;

    if (!name || !strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ message: "Name and strategies are required" });
    }

    const newCombo = new ComboStrategy({
      userId: req.user._id,
      name,
      description: description || "",
      strategies,
      params: params || {},
    });

    await newCombo.save();
    res.status(201).json(newCombo);
  } catch (err) {
    console.error("createComboStrategy error:", err);
    res.status(500).json({ message: "Failed to create combo strategy" });
  }
};

// Delete a combo strategy
export const deleteComboStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ComboStrategy.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ message: "Combo strategy not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("deleteComboStrategy error:", err);
    res.status(500).json({ message: "Failed to delete combo strategy" });
  }
};
