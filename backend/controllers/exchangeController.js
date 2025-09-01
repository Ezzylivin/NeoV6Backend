// File: src/backend/controllers/exchangeController.js
import Exchange from "../dbStructure/exchange.js";
import ccxt from "ccxt";

/**
 * GET /api/exchanges
 * Returns all exchanges from DB with live USD trading pairs
 */
export const getExchanges = async (req, res) => {
  try {
    // 1️⃣ Fetch all exchanges from your MongoDB
    const dbExchanges = await Exchange.find(); // [{name, apiKey, secret, baseUrl}, ...]

    const result = [];

    for (const ex of dbExchanges) {
      const exchangeId = ex.name.toLowerCase(); // match CCXT id
      let symbols = [];

      if (ccxt[exchangeId]) {
        try {
          const ccxtEx = new ccxt[exchangeId]();
          await ccxtEx.loadMarkets();
          symbols = ccxtEx.symbols.filter((s) => s.includes("USD")); // USD pairs only
        } catch (err) {
          console.warn(`[CCXT Error] ${ex.name}:`, err.message);
        }
      }

      result.push({
        name: ex.name,
        baseUrl: ex.baseUrl || null,
        apiKey: !!ex.apiKey,
        symbols,
      });
    }

    res.json({ success: true, exchanges: result });
  } catch (err) {
    console.error("[Exchanges Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
