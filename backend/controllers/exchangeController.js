// File: src/backend/controllers/exchangeController.js
import ccxt from "ccxt";

/**
 * GET /api/exchanges
 * Returns US-based exchanges with live USD trading pairs
 */
export const getExchanges = async (req, res) => {
  try {
    // Pick a few popular exchanges that support USD
    const US_EXCHANGES = ["coinbase", "kraken", "gemini"];

    const result = [];

    for (const id of US_EXCHANGES) {
      try {
        const exchange = new ccxt[id]();
        await exchange.loadMarkets();

        // Only USD pairs
        const symbols = exchange.symbols.filter((s) => s.includes("USD"));

        result.push({
          name: id,
          symbols,
        });
      } catch (err) {
        console.warn(`[CCXT Error] ${id}:`, err.message);
      }
    }

    res.json({ success: true, exchanges: result });
  } catch (err) {
    console.error("[Exchanges Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
