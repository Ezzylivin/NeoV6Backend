// File: backend/controllers/strategyController.js
// UPGRADED: Uses the strategy service and ensures the API always returns an array.
// Added unique 'code' field for each strategy to fix backtest lookup.

import Strategy from "../dbStructure/strategy.js";
import mongoose from 'mongoose';
import { getStrategiesService } from "../services/strategyEngineService.js";
import { nanoid } from "nanoid"; // <-- NEW: For unique strategy codes

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

        // --- Generate unique code for strategy ---
        // FIX: Use 'code' as the variable name to match the schema.
        const code = nanoid(8);

        // FIX: Assign the 'code' variable to the 'code' field.
        const newStrategy = await Strategy.create({ userId, name, description, params, code });
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
        const userId = req.user.id;
        const strategies = await getStrategiesService(userId);

        const responseData = { strategies: Array.isArray(strategies) ? strategies : [strategies] };

        res.status(200).json(responseData);
    } catch (err) {
        sendError(res, err);
    }
};

export const getStrategyById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const strategy = await Strategy.findOne({ code: id, userId }).lean();

        if (!strategy) {
            return res.status(404).json({ message: "Strategy not found or unauthorized." });
        }

        res.status(200).json(strategy);
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ message: "Invalid strategy code." });
        }
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
