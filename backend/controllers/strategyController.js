// File: backend/controllers/strategyController.js
// UPGRADED: Uses the strategy service and ensures the API always returns an array.

import Strategy from "../dbStructure/strategy.js";
import mongoose from 'mongoose';
import { getStrategiesService } from "../services/strategyEngineService.js"; // <-- IMPORT

const sendError = (res, err, status = 500) => {
    console.error(err);
    res.status(status).json({ message: err.message || "An unexpected error occurred." });
};

export const createStrategy = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, description, params } = req.body;
        if (!name || !params) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        const newStrategy = await Strategy.create({ userId, name, description, params });
        res.status(201).json(newStrategy);
    } catch(err) {
        sendError(res, err);
    }
};

export const updateStrategy = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { name, description, params } = req.body;

        const updatedStrategy = await Strategy.findOneAndUpdate(
            { _id: id, userId: userId },
            { name, description, params },
            { new: true, runValidators: true }
        );

        if (!updatedStrategy) {
            return res.status(404).json({ message: "Strategy not found or you do not have permission to edit it" });
        }
        
        res.status(200).json(updatedStrategy);
    } catch(err) {
        sendError(res, err);
    }
};

export const getUserStrategies = async (req, res) => {
    try {
        // --- THIS IS THE FIX ---
        // 1. Call the service to get the data.
        const strategies = await getStrategiesService(req.user.id);

        // 2. Ensure the response is always an array.
        // (The service already does this, but this is a good safeguard).
        const strategiesArray = Array.isArray(strategies) ? strategies : [strategies];
        
        res.status(200).json(strategiesArray);
    } catch (err) {
        sendError(res, err);
    }
};

export const deleteStrategy = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid strategy ID format." });
        }

        const result = await Strategy.deleteOne({ _id: id, userId: req.user.id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Strategy not found or you do not have permission to delete it" });
        }
        
        res.status(200).json({ message: "Strategy deleted successfully" });
    } catch (err) {
        sendError(res, err);
    }
};
