// File: src/backend/services/priceService.js
import axios from "axios";

// US-based exchanges
const COINBASE_PRO = "https://api.pro.coinbase.com";
const GEMINI = "https://api.gemini.com/v1";
const KRAKEN = "https://api.kraken.com/0/public";

// Symbol mapping per exchange
const geminiSymbolMap = {
  BTCUSDT: "btcusd",
  ETHUSDT: "ethusd",
  BNBUSDT: "bnbusd",
};

const krakenSymbolMap = {
  BTCUSDT: "XBTUSD",
  ETHUSDT: "ETHUSD",
  BNBUSDT: "BNBUSD",
};

// --- Helper: delay ---
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// --- Fetch from Coinbase with retry ---
const fetchCoinbase = async (symbol) => {
  const url = `${COINBASE_PRO}/products/${symbol}/ticker`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data } = await axios.get(url);
      return parseFloat(data.price);
    } catch (err) {
      if (err.response?.status === 503 && attempt < 2) {
        console.warn(`[PriceService] Coinbase 503 for ${symbol}, retrying...`);
        await delay(500); // 0.5s before retry
      } else {
        console.warn(`[PriceService] Coinbase failed for ${symbol}:`, err.message);
      }
    }
  }
  return null;
};

// --- Fetch from Gemini ---
const fetchGemini = async (symbol) => {
  const geminiSymbol = geminiSymbolMap[symbol];
  if (!geminiSymbol) return null;
  const url = `${GEMINI}/pubticker/${geminiSymbol}`;
  try {
    const { data } = await axios.get(url);
    return parseFloat(data.last);
  } catch (err) {
    console.warn(`[PriceService] Gemini failed for ${symbol}:`, err.message);
    return null;
  }
};

// --- Fetch from Kraken ---
const fetchKraken = async (symbol) => {
  const krakenSymbol = krakenSymbolMap[symbol];
  if (!krakenSymbol) return null;
  try {
    const res = await axios.get(`${KRAKEN}/Ticker`, { params: { pair: krakenSymbol } });
    const key = Object.keys(res.data.result)[0];
    return parseFloat(res.data.result[key].c[0]);
  } catch (err) {
    console.warn(`[PriceService] Kraken failed for ${symbol}:`, err.message);
    return null;
  }
};

// --- Public: fetch live prices with fallback ---
export const fetchLivePrices = async (symbols) => {
  const prices = {};
  for (const sym of symbols) {
    let price = await fetchCoinbase(sym);
    if (price == null) price = await fetchGemini(sym);
    if (price == null) price = await fetchKraken(sym);
    prices[sym] = price;
  }
  return prices;
};

// --- Public: start auto price feed ---
export const startPriceFeed = (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"], intervalMs = 10000, setPriceFn) => {
  const updateAll = async () => {
    const prices = await fetchLivePrices(symbols);
    if (setPriceFn) setPriceFn(prices);
    console.log("[PriceService] Updated prices:", prices);
  };
  updateAll();
  setInterval(updateAll, intervalMs);
};

// --- Export ---
export default {
  fetchLivePrices,
  startPriceFeed,
};
