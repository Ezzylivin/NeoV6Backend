// File: src/backend/controllers/botController.js
import TradingBotHistory from "../dbStructure/tradingBotHistory.js";
import Strategy from "../dbStructure/strategy.js";

const US_EXCHANGES = ["binanceus", "coinbasepro", "kraken"];
const TOP_PAIRS = ["BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "LTC/USD"];

let liveBots = {}; // In-memory live bot state

// --- Start Bot ---
export const startBotController = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    if (!userId || !symbol || !initialBalance) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Validate symbol
    if (!TOP_PAIRS.includes(symbol)) {
      return res.status(400).json({ success: false, message: `Symbol ${symbol} not allowed` });
    }

    // Validate exchange
    if (strategy?.exchange && !US_EXCHANGES.includes(strategy.exchange.toLowerCase())) {
      return res.status(400).json({ success: false, message: `Exchange ${strategy.exchange} not allowed` });
    }

    // Save/update strategy in DB
    const userStrategy = await Strategy.findOneAndUpdate(
      { userId, name: strategy?.name || "Default Strategy" },
      { params: strategy?.params || {} },
      { upsert: true, new: true }
    );

    // Save initial bot history
    const historyEntry = await TradingBotHistory.create({
      userId,
      symbol,
      balance: initialBalance,
      profit: 0,
      strategy: strategy?.name || "Default",
      risk: risk || "Medium",
      timestamp: new Date(),
    });

    // Start live bot in memory
    liveBots[userId] = { symbol, timeframe, initialBalance, strategy, risk, isRunning: true };

    res.json({ success: true, message: "Bot started", bot: liveBots[userId], entry: historyEntry });
  } catch (err) {
    console.error("[Start Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Stop Bot ---
export const stopBotController = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!liveBots[userId]) {
      return res.status(400).json({ success: false, message: "No bot running for this user" });
    }

    liveBots[userId].isRunning = false;
    delete liveBots[userId];

    res.json({ success: true, message: "Bot stopped" });
  } catch (err) {
    console.error("[Stop Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get Bot Status ---
export const getBotStatusController = async (req, res) => {
  try {
    const { userId } = req.params;
    const bot = liveBots[userId];

    if (!bot) return res.json({ success: true, status: { isRunning: false } });

    res.json({ success: true, status: { isRunning: bot.isRunning, ...bot } });
  } catch (err) {
    console.error("[Bot Status Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get User Trading Bot History ---
export const getHistoryController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const history = await TradingBotHistory.find({ userId }).sort({ timestamp: 1 });
    res.json({ success: true, history });
  } catch (err) {
    console.error("[Bot History Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
