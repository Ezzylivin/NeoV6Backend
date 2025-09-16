// File: backend/controllers/backtestController.js
// UPGRADED: Now uses a monolithic architecture, getting data directly from a local controller.

import axios from 'axios';
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";
import { getBacktestOptions as fetchDataOptions } from "./dataController.js"; // Renamed import
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";

const sendResponse = (res, data = {}, message = "Success") => {
    return res.status(200).json({ success: true, message, data });
};

const sendError = (res, error, controllerName) => {
    console.error(`[Controller Error: ${controllerName}]`, error);
    res.status(500).json({
        success: false,
        message: error.message || "An internal server error occurred."
    });
};

// NEW FUNCTION: Fetches symbols and timeframes directly from a local controller
export const getBacktestOptions = async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch strategies from the database
        const strategies = await Strategy.find({ userId }).select("name params").lean();
        
        // Fetch symbols and timeframes from the local data controller
        const optionsResponse = await fetchDataOptions(req, res);
        
        // This is a common pattern to ensure data is correctly formatted
        const symbols = optionsResponse.data.symbols;
        const timeframes = optionsResponse.data.timeframes;

        // Combine the results and send them as the backtest options
        return sendResponse(res, {
            symbols: symbols,
            timeframes: timeframes,
            strategies: strategies, // This is the list of strategies from your DB
        }, "Backtest options fetched successfully");

    } catch (err) {
        sendError(res, err, 'getBacktestOptions');
    }
};

// ... (rest of the controller file remains unchanged) ...
