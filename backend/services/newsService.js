// File: backend/services/newsService.js
import axios from "axios";

const API_KEY = process.env.NEWS_API_KEY; // e.g., Finnhub or NewsAPI

/**
 * Fetch historical news for a symbol between startDate and endDate
 * Returns array of { time: Date, impact: number }
 */
export async function fetchHistoricalNews(symbol, startDate, endDate) {
  if (!API_KEY) return []; // Skip if no API key
  if (!symbol) return [];

  const from = startDate ? new Date(startDate).toISOString().split("T")[0] : new Date(Date.now() - 30*24*3600*1000).toISOString().split("T")[0];
  const to = endDate ? new Date(endDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${API_KEY}`;

  try {
    const res = await axios.get(url);
    return res.data.map(n => ({
      time: new Date(n.datetime * 1000),
      impact: n.sentiment || 0 // sentiment score (0 if not available)
    }));
  } catch (err) {
    console.warn(`[NewsService] Failed to fetch news for ${symbol}: ${err.message}`);
    return [];
  }
}
