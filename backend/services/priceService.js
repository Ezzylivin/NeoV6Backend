import fetch from "node-fetch";
import Price from "../dbStructure/price.js"; // MongoDB model
import fetchFromBinance from "./exchanges/binance.js";
import fetchFromCoinbase from "./exchanges/coinbase.js";
import fetchFromGemini from "./exchanges/gemini.js";
import fetchFromKraken from "./exchanges/kraken.js"; // optional

let prices = {}; // in-memory live cache

// --- Multi-exchange fetch with fallback ---
const exchanges = [fetchFromBinance, fetchFromCoinbase, fetchFromGemini, fetchFromKraken];

export async function fetchPrice(symbol) {
  for (const source of exchanges) {
    try {
      const data = await source(symbol);
      if (data && (data.close != null || typeof data === "number")) {
        return typeof data === "number" ? { close: data } : data;
      }
    } catch (err) {
      console.warn(`[PriceService] ${source.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`No valid price for ${symbol}`);
}

// --- Save price to DB and update cache ---
export async function savePrice(symbol) {
  const data = await fetchPrice(symbol);
  const priceValue = data.close;
  const priceDoc = await Price.create({
    symbol,
    close: priceValue,
    timestamp: new Date(),
  });
  prices[symbol] = priceValue;
  return priceDoc;
}

// --- Fetch historical data for 24h charts ---
export async function getHistory(symbol, periodHours = 24) {
  const end = new Date();
  const start = new Date(end.getTime() - periodHours * 60 * 60 * 1000);
  const history = await Price.find({ symbol, timestamp: { $gte: start, $lte: end } })
    .sort({ timestamp: 1 })
    .lean();
  return history.map(p => ({ time: p.timestamp, price: p.close }));
}

// --- Update all tracked symbols ---
export async function updatePrices(symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
  for (const symbol of symbols) {
    try {
      const priceDoc = await savePrice(symbol);
      console.log(`[PriceService] ${symbol}: $${priceDoc.close}`);
    } catch (err) {
      console.error(`[PriceService] Failed for ${symbol}:`, err.message);
    }
  }
}

// --- Get live cached prices ---
export function getPrices(symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
  const result = {};
  symbols.forEach(s => {
    result[s] = prices[s] || null;
  });
  return result;
}

// --- Start automatic price feed ---
export function startPriceFeed(symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"], intervalMs = 10000) {
  updatePrices(symbols); // initial fetch
  setInterval(() => updatePrices(symbols), intervalMs);
}

export default {
  fetchPrice,
  savePrice,
  getHistory,
  updatePrices,
  getPrices,
  startPriceFeed,
};
