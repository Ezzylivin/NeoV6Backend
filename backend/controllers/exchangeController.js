// File: src/backend/controllers/exchangeController.js
import Exchange from "../dbStructure/exchange.js";
import ccxt from "ccxt";

/**
 * GET /api/exchanges
 * Returns all exchanges from DB with live USD trading pairs
 */
export const getExchanges = async (req, res) => {
  try {
    // 1️⃣ Fetch all exchanges stored in MongoDB
    const dbExchanges = await Exchange.find(); // e.g. [{name: "coinbase"}, {name: "kraken"}]

    const result = [];

    for (const ex of dbExchanges) {
      const exchangeId = ex.name.toLowerCase();
      let symbols = [];

      if (ccxt[exchangeId]) {
        try {
          const ccxtEx = new ccxt[exchangeId]();
          await ccxtEx.loadMarkets();
          symbols = ccxtEx.symbols.filter((s) => s.includes("USD")); // ✅ USD pairs only
        } catch (err) {
          console.warn(`[CCXT Error] ${ex.name}:`, err.message);
        }
      }

      result.push({
        name: ex.name,
        symbols, // ✅ only send symbols + name (Dashboard expects this)
      });
    }

    res.json({ success: true, exchanges: result });
  } catch (err) {
    console.error("[Exchanges Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
