// File: src/backend/controllers/botController.js
import TradingBotHistory from "../dbStructure/tradingBotHistory.js";

// --- Start bot ---
export const startBotController = async (req, res) => {
  try {
    const { userId, symbol, initialBalance, strategy, risk } = req.body;
    if (!userId || !symbol || !initialBalance) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const historyEntry = await TradingBotHistory.create({
      userId,
      symbol,
      balance: initialBalance,
      profit: 0,
      strategy: strategy || "Default",
      risk: risk || "Medium",
      timestamp: new Date(),
    });

    res.json({ success: true, message: "Bot started", entry: historyEntry });
  } catch (err) {
    console.error("[Start Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Stop bot ---
export const stopBotController = async (req, res) => {
  try {
    res.json({ success: true, message: "Bot stopped" });
  } catch (err) {
    console.error("[Stop Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get bot status ---
export const getBotStatusController = async (req, res) => {
  try {
    res.json({ success: true, status: { isRunning: true } });
  } catch (err) {
    console.error("[Bot Status Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get user trading bot history ---
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
