// File: backend/services/backtestDataService.js
import ccxt from "ccxt";
import axios from "axios";
import Cache from "../dbStructure/cache.js";

// --- Config ---
const US_EXCHANGES = ["coinbase", "kraken", "gemini"];
const CANDLE_LIMIT = 400;
const CACHE_DURATION = 10 * 60 * 1000; // 10 min persistent cache
const CACHE_TTL_MS = 60 * 1000; // 1 min in-memory cache for candles

// --- In-memory caches ---
const cache = new Map();
let supportedSymbols = null; // will hold all valid pairs from US exchanges

// --- Preload markets at startup ---
async function preloadMarkets() {
  supportedSymbols = new Set();

  for (const exchangeId of US_EXCHANGES) {
    try {
      const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
      const markets = await exchange.loadMarkets();

      Object.keys(markets).forEach((symbol) => {
        if (symbol.includes("/USD")) {
          supportedSymbols.add(symbol);
        }
      });

      console.log(
        `[CandleService] Loaded ${Object.keys(markets).length} markets from ${exchangeId}`
      );
    } catch (err) {
      console.error(`[CandleService] Failed to load markets for ${exchangeId}:`, err.message);
    }
  }

  console.log(
    `[CandleService] Supported USD symbols across US exchanges: ${[...supportedSymbols].join(", ")}`
  );
}

// Kick off preload on module import
preloadMarkets();

// --- Helpers ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  console.log(`[CandleService] Attempting to fetch ${symbol} on ${exchange.id}`);
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    if (candles && candles.length > 0) {
      console.log(`[CandleService] Successfully fetched ${candles.length} candles for ${symbol}`);
      return candles;
    }
    console.warn(`[CandleService] Exchange returned empty data for ${symbol}.`);
    return null;
  } catch (e) {
    console.error(`[CandleService] Error fetching ${symbol} on ${exchange.id}:`, e.message);
    return null;
  }
}

// --- Main: Backtest Options ---
export async function getBacktestOptionsData() {
  const cacheKey = "backtestOptions";
  const cachedEntry = await Cache.findOne({ key: cacheKey });

  if (cachedEntry) {
    console.log("Serving backtest options from persistent cache.");
    return cachedEntry.data;
  }

  const cryptoApiUrl =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1";

  try {
    const response = await axios.get(cryptoApiUrl);
    const top10Cryptos = response.data.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase() + "/USD",
    }));

    // Filter only those supported on US exchanges
    const tradable = top10Cryptos
      .map((c) => c.symbol)
      .filter((s) => supportedSymbols && supportedSymbols.has(s));

    const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
    const newOptions = { symbols: tradable, timeframes };

    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.create({ key: cacheKey, data: newOptions, expiresAt });

    return newOptions;
  } catch (err) {
    console.error("❌ Failed to fetch backtest options:", err);
    return {
      symbols: ["BTC/USD", "ETH/USD"], // safe fallback
      timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
    };
  }
}

// --- Candle fetch across US exchanges ---
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const key = `${symbol}::${timeframe}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  for (const exchangeId of US_EXCHANGES) {
    console.log(`[CandleService] Trying US exchange: ${exchangeId}`);
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });

    const symbolFormats = [
      symbol.includes("/") ? symbol : `${symbol.slice(0, -3)}/${symbol.slice(-3)}`,
      symbol.replace("/", "-"),
    ];

    for (const format of symbolFormats) {
      const candles = await fetchCandlesWithRetry(exchange, format, timeframe);
      if (candles) {
        const result = { candles };
        cache.set(key, { ts: Date.now(), value: result });
        return result;
      }
    }
  }

  throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}
