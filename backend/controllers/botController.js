// src/backend/controllers/botController.js
import TradingBotHistory from "../dbStructure/tradingBotHistory.js";
import Strategy from "../dbStructure/strategy.js";
import { isValidMarket } from "../utils/validateMarket.js";

let liveBots = {}; // in-memory live bots

export const startBotController = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk, exchange } = req.body;

    if (!userId || !symbol || !initialBalance || !exchange) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Validate symbol
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ success: false, message: "Invalid symbol or exchange" });

    // Save strategy
    const userStrategy = await Strategy.findOneAndUpdate(
      { userId },
      { name: strategy?.name || "Default Strategy", params: strategy?.params || {} },
      { upsert: true, new: true }
    );

    // Save history
    const historyEntry = await TradingBotHistory.create({
      userId,
      symbol,
      balance: initialBalance,
      profit: 0,
      strategy: strategy?.name || "Default",
      risk: risk || "Medium",
      timestamp: new Date(),
    });

    // Start bot in-memory
    liveBots[userId] = { symbol, timeframe, initialBalance, strategy, risk, exchange, isRunning: true };

    res.json({ success: true, message: "Bot started", bot: liveBots[userId], entry: historyEntry });
  } catch (err) {
    console.error("[Start Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Stop Bot
export const stopBotController = async (req, res) => {
  const { userId } = req.body;
  if (!liveBots[userId]) return res.status(400).json({ success: false, message: "No bot running" });

  liveBots[userId].isRunning = false;
  delete liveBots[userId];

  res.json({ success: true, message: "Bot stopped" });
};

// Get Bot History / Status
export const getBotHistory = async (req, res) => {
  const { userId } = req.params;
  const bot = liveBots[userId];
  if (!bot) return res.json({ history: [] });

  const history = [
    { timestamp: Date.now() - 60000, balance: bot.initialBalance, profit: 0 },
    { timestamp: Date.now(), balance: bot.initialBalance * 1.01, profit: bot.initialBalance * 0.01 },
  ];

  res.json({ history });
};
