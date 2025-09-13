// File: backend/controllers/strategyController.js
import Strategy from "../dbStructure/strategy.js";

const sendError = (res, err, message = "Server Error", status = 500) => {
    console.error(message, err);
    return res.status(status).json({ message, error: err.message });
};

export const upsertStrategy = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const { id, name, description, params } = req.body;

    if (!name || !params) {
      return res.status(400).json({ message: "Missing required fields: name, params" });
    }

    // Use findOneAndUpdate for a clean upsert operation
    // It will update if found, or insert if not (with 'upsert: true')
    const strategy = await Strategy.findOneAndUpdate(
        { _id: id, userId: userId }, // Match by ID and ensure user ownership
        { userId, name, description, params },
        { new: true, upsert: true, runValidators: true } // Options: return new doc, create if not found
    );
    
    return res.status(201).json(strategy);
  } catch (err) {
    return sendError(res, err, "Error upserting strategy");
  }
};

export const getUserStrategies = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const strategies = await Strategy.find({ userId });
    return res.status(200).json(strategies);
  } catch (err) {
    return sendError(res, err, "Error fetching strategies");
  }
};

export const getStrategyById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const strategy = await Strategy.findOne({ _id: id, userId: userId });

    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found or you do not have permission to view it" });
    }
    return res.status(200).json(strategy);
  } catch (err) {
    return sendError(res, err, "Error fetching strategy by ID");
  }
};

export const deleteStrategy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await Strategy.deleteOne({ _id: id, userId: userId });

    if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Strategy not found or you do not have permission to delete it" });
    }
    return res.status(200).json({ message: "Strategy deleted successfully" });
  } catch (err) {
    return sendError(res, err, "Error deleting strategy");
  }
};
