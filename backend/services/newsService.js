// File: backend/services/newsService.js
import axios from "axios";

const API_KEY = process.env.NEWS_API_KEY; // e.g., NewsAPI or Finnhub

export async function fetchNews(symbol, startDate, endDate) {
  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${startDate}&to=${endDate}&token=${API_KEY}`;
  try {
    const res = await axios.get(url);
    // Map news to simple format for backtesting
    return res.data.map(n => ({
      time: new Date(n.datetime * 1000),
      impact: n.sentiment || 0 // sentiment score if available
    }));
  } catch (err) {
    console.error(`[NewsService] Failed for ${symbol}: ${err.message}`);
    return [];
  }
}
