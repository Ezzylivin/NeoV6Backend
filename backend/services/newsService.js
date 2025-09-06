import { fetchNews } from "./newsService.js";

export async function runBacktest({ userId, symbol, useNews = false, startDate, endDate, ...rest }) {
  
  // Fetch candles
  let candles = await fetchOHLCVMulti(symbol, rest.timeframe, rest.limit);

  // Optional news integration
  let news = [];
  if (useNews) {
    try {
      news = await fetchNews(symbol, startDate, endDate);
    } catch (err) {
      console.warn(`[Backtest] Failed to fetch news for ${symbol}: ${err.message}`);
      news = [];
    }
  }

  for (let i = 0; i < candles.length; i++) {
    let price = candles[i].price;

    // Apply news impact if available
    if (useNews) {
      const relevantNews = news.filter(n => n.time.getTime() === candles[i].time.getTime());
      for (const n of relevantNews) {
        price *= 1 + n.impact / 100; // simple proportional impact
      }
    }

    // ...existing strategy execution & backtest logic...
  }

  // ...rest of runBacktest...
}
