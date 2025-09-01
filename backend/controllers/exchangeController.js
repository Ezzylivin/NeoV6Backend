// File: src/backend/controllers/exchangeController.js
import ccxt from "ccxt";

const US_EXCHANGES = ["coinbase", "coinbasepro", "kraken", "gemini"];

export const getExchanges = async (req, res) => {
  try {
    const result = [];

    for (const id of US_EXCHANGES) {
      let symbols = [];
      try {
        const ex = new ccxt[id]();
        await ex.loadMarkets();
        symbols = ex.symbols.filter((s) => s.includes("USD")); // USD pairs only
      } catch (err) {
        console.warn(`[CCXT Error] ${id}:`, err.message);
      }

      result.push({ name: id, symbols });
    }

    res.json({ success: true, exchanges: result });
  } catch (err) {
    console.error("[Exchanges Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
