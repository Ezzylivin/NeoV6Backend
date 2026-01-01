// File: src/backend/controllers/mlController.js

// 🟢 IMPORT THE SERVICE (Don't use axios here directly)
import { getAvailableModels } from "../services/mlService.js";

export const getModelsController = async (req, res) => {
  try {
    // 1. Call Service (Handles Cache + Python + Errors)
    const models = await getAvailableModels();

    // 2. Return Result
    // Even if empty, we return a 200 OK so the frontend doesn't crash with 500
    res.status(200).json(models);

  } catch (error) {
    console.error("[mlController] Critical Error:", error);
    res.status(500).json({ 
      message: "Internal Server Error fetching models", 
      error: error.message 
    });
  }
};
