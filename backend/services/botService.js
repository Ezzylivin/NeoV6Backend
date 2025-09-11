// File: src/backend/services/botService.js
// Unified trading bot service — starts/stops in-memory loops per user, uses runBacktest
// to compute simulated trades when requested, and also supports light live-simulation loop.

import Bot from "../dbStructure/bot.js";
import TradingBotHistory from "../dbStructure/tradingBotHistory.js";
import Price from "../dbStructure/price.js";
import { runBacktest } from "./backtestService.js"; // fixed import
import { logToDb } from "./logService.js";

// in-memory store of intervals keyed by userId
const activeBots = new Map();

/**
 * lightweight helper to sample latest prices (used for quick simulated actions)
 */
async function getRecentCandles(symbol, limit = 200) {
  const rows = await Price.find({ symbol }).sort({ timestamp: -1 }).limit(limit).lean();
  return rows.reverse().map(r => ({
    time: new Date(r.timestamp),
    open: Number(r.open ?? r.price ?? r.close ?? 0),
    high: Number(r.high ?? r.price ?? r.close ?? 0),
    low: Number(r.low ?? r.price ?? r.close ?? 0),
    close: Number(r.close ?? r.price ?? 0),
    volume: Number(r.volume ?? 0)
  }));
}

/**
 * Single iteration of bot: run small backtest window and persist a snapshot to TradingBotHistory.
 * This allows the bot to "act" using the same strategies as the heavier backtests.
 */
async function botIteration(userId) {
  const bot = await Bot.findOne({ userId });
  if (!bot || !bot.isRunning) return;

  try {
    // quick-run a short backtest window to determine current metrics
    const result = await runBacktest({
      userId,
      symbol: bot.symbol,
      timeframe: bot.timeframes?.[0] || "1h",
      initialBalance: bot.balance ?? bot.initialBalance ?? 1000,
      strategy: bot.strategy || { name: "SMA", parameters: {} },
      risk: bot.risk || "Medium",
      limit: 500,
    });

    const metrics = result.metrics ?? { finalBalance: bot.balance, netProfit: 0 };

    // append a snapshot to history
    const snapshot = await TradingBotHistory.create({
      userId,
      symbol: bot.symbol,
      balance: metrics.finalBalance,
      profit: metrics.netProfit,
      strategy: bot.strategy,
      risk: bot.risk,
      timestamp: new Date()
    });

    // update active bot balance
    bot.balance = metrics.finalBalance;
    await bot.save();

    await logToDb(userId, `[Bot Iteration] ${bot.symbol} | Bal: ${metrics.finalBalance} | P/L: ${metrics.netProfit}`);
    return snapshot;
  } catch (err) {
    console.error(`[Bot Iteration Error][${userId}]`, err);
    await logToDb(userId, `[Bot Error] ${err.message}`);
  }
}

/**
 * Start trading bot for userId
 * config: { symbol, timeframes (array/string), initialBalance, strategy (string or {name,parameters}), risk }
 */
export async function startTradingBot(userId, config = {}) {
  if (!userId) throw new Error("Missing userId");
  const { symbol, timeframes = ["1h"], initialBalance = 1000, strategy = { name: "SMA", parameters: {} }, risk = "Medium" } = config;

  let bot = await Bot.findOne({ userId });
  if (!bot) {
    bot = await Bot.create({
      userId,
      symbol,
      timeframes,
      initialBalance,
      balance: initialBalance,
      strategy,
      risk,
      isRunning: true,
      startedAt: new Date()
    });
  } else {
    bot.symbol = symbol;
    bot.timeframes = Array.isArray(timeframes) ? timeframes : [timeframes];
    bot.initialBalance = initialBalance;
    bot.balance = initialBalance;
    bot.strategy = strategy;
    bot.risk = risk;
    bot.isRunning = true;
    bot.startedAt = new Date();
    await bot.save();
  }

  // create history entry
  await TradingBotHistory.create({
    userId,
    symbol,
    balance: bot.balance,
    profit: 0,
    strategy,
    risk,
    timestamp: new Date()
  });

  // start interval if not running
  if (!activeBots.has(userId)) {
    const interval = setInterval(() => {
      // fire and forget
      botIteration(userId).catch(e => console.error("[botIteration err]", e));
    }, 10 * 1000); // run every 10s (tune as desired)
    activeBots.set(userId, interval);
  }

  await logToDb(userId, `[Bot Started] ${symbol} strategy=${strategy?.name || strategy} risk=${risk}`);
  return bot;
}

/**
 * Stop trading bot
 */
export async function stopTradingBot(userId) {
  const bot = await Bot.findOne({ userId });
  if (bot) {
    bot.isRunning = false;
    await bot.save();
  }
  if (activeBots.has(userId)) {
    clearInterval(activeBots.get(userId));
    activeBots.delete(userId);
  }
  await logToDb(userId, `[Bot Stopped]`);
  return bot;
}

/**
 * Get bot status
 */
export async function getBotStatus(userId) {
  const bot = await Bot.findOne({ userId });
  if (!bot) return { isRunning: false };
  return {
    isRunning: bot.isRunning,
    symbol: bot.symbol,
    timeframes: bot.timeframes,
    balance: bot.balance,
    strategy: bot.strategy,
    risk: bot.risk,
    startedAt: bot.startedAt
  };
}

/**
 * Get trading history snapshots
 */
export async function getBotHistory(userId, limit = 1000) {
  return TradingBotHistory.find({ userId }).sort({ timestamp: 1 }).limit(limit);
}
