// backend/services/priceService.js
import fetch from "node-fetch";

let prices = {};

// Exchange mapping (internal symbol → exchange format)
const SYMBOL_MAP = {
  BTCUSDT: { coinbase: "BTC-USD", gemini: "btcusd", kraken: "XXBTZUSD" },
  ETHUSDT: { coinbase: "ETH-USD", gemini: "ethusd", kraken: "XETHZUSD" },
  BNBUSDT: { coinbase: null, gemini: null, kraken: null }, // not widely supported on US exchanges
};

/** Try Coinbase first */
const fetchFromCoinbase = async (symbol) => {
  const product = SYMBOL_MAP[symbol]?.coinbase;
  if (!product) return null;

  const res = await fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`);
  const data = await res.json();
  return data.price ? parseFloat(data.price) : null;
};

/** Fallback: Gemini */
const fetchFromGemini = async (symbol) => {
  const pair = SYMBOL_MAP[symbol]?.gemini;
  if (!pair) return null;

  const res = await fetch(`https://api.gemini.com/v1/pubticker/${pair}`);
  const data = await res.json();
  return data.last ? parseFloat(data.last) : null;
};

/** Fallback: Kraken */
const fetchFromKraken = async (symbol) => {
  const pair = SYMBOL_MAP[symbol]?.kraken;
  if (!pair) return null;

  const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
  const data = await res.json();
  const result = data?.result?.[pair];
  return result?.c?.[0] ? parseFloat(result.c[0]) : null;
};

/** Master fetcher with fallback */
const fetchPrice = async (symbol) => {
  let price = await fetchFromCoinbase(symbol);
  if (price) return price;

  price = await fetchFromGemini(symbol);
  if (price) return price;

  price = await fetchFromKraken(symbol);
  if (price) return price;

  console.error(`[PriceService] No price available for ${symbol}`);
  return null;
};

const updatePrices = async (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  try {
    for (const sym of symbols) {
      const price = await fetchPrice(sym);
      if (price) prices[sym] = price;
    }
  } catch (err) {
    console.error("[PriceService] Failed to update prices:", err.message);
  }
};

const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};

const startPriceFeed = (intervalMs = 10000) => {
  updatePrices(); // initial
  setInterval(updatePrices, intervalMs);
};

export default {
  updatePrices,
  getPrices,
  startPriceFeed,
};
