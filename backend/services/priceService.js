import Price from "../dbStructure/price.js";
import fetch from "node-fetch";

let prices = {}; // in-memory cache

// --- Exchange fetchers ---
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Coinbase failed");
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

const fetchFromGemini = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.gemini.com/v1/pubticker/${base.toLowerCase()}usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gemini failed");
  const data = await res.json();
  return { close: parseFloat(data.last), timestamp: new Date() };
};

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const url = `https://api.kraken.com/0/public/Ticker?pair=${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kraken failed");
  const data = await res.json();
  const pairKey = Object.keys(data.result)[0];
  return { close: parseFloat(data.result[pairKey].c[0]), timestamp: new Date() };
};

// --- Fetch price from multiple exchanges ---
export const fetchPrice = async (symbol) => {
  const exchanges = [fetchFromCoinbase, fetchFromGemini, fetchFromKraken];
  for (const ex of exchanges) {
    try {
      return await ex(symbol);
    } catch (err) {
      console.warn(`[PriceService] ${ex.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`All exchanges failed for ${symbol}`);
};

// --- Save price ---
export const savePrice = async (symbol) => {
  try {
    const data = await fetchPrice(symbol);
    const price = new Price({ ...data, symbol });
    await price.save();
    prices[symbol] = data.close;
    return price;
  } catch (err) {
    console.error(`[PriceService] savePrice failed for ${symbol}:`, err.message);
    return null; // don't block other symbols
  }
};

// --- Start automatic price feed ---
export const startPriceFeed = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"], intervalMs = 10000) => {
  const updateAll = async () => {
    await Promise.all(symbols.map(savePrice)); // fetch concurrently
  };
  updateAll();
  setInterval(updateAll, intervalMs);
};

// --- Get live prices ---
export const getPrices = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"]) => {
  if (!Array.isArray(symbols)) symbols = [symbols];
  const result = {};
  symbols.forEach(s => (result[s] = prices[s] || null));
  return result;
};

export default { fetchPrice, savePrice, startPriceFeed, getPrices };
