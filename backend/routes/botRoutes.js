// File: src/backend/routes/botRoutes.js
import express from "express";
import { isValidMarket } from "../utils/validateMarket.js";
import Bot from "../dbStructure/bot.js";
import { stopBot, getBotHistory } from "../controllers/botController.js";

const router = express.Router();

// --- Start live bot ---
router.post("/start", async (req, res) => {
  const { userId, symbol, strategy, initialBalance, timeframe, risk, exchange = "coinbase" } = req.body;

  try {
    // Validate the symbol is allowed for the exchange
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ message: `Invalid symbol ${symbol} for exchange ${exchange}` });

    // Create bot entry in DB
    const bot = await Bot.create({
      userId,
      symbol,
      strategy,
      initialBalance,
      timeframe,
      risk,
      exchange,
      isRunning: true,
    });

    res.json({ message: "Bot started", bot });
  } catch (err) {
    console.error("[Start Bot Error]", err);
    res.status(500).json({ message: "Failed to start bot" });
  }
});

// --- Stop live bot ---
router.post("/stop", stopBot);

// --- Get user bot history for charts ---
router.get("/history/:userId", getBotHistory);

export default router;
