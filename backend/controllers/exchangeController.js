// File: src/backend/controllers/exchangeController.js
import Exchange from "../dbStructure/exchange.js";
import ccxt from "ccxt";

/**
 * GET /api/exchanges
 * Returns all exchanges from DB with live USD trading pairs.
 * Auto-seeds DB if empty.
 */
export const getExchanges = async (req, res) => {
  try {
    // 1️⃣ Fetch all exchanges from MongoDB
    let dbExchanges = await Exchange.find();

    // 2️⃣ Auto-seed if empty
    if (dbExchanges.length === 0) {
      const seedExchanges = [
        { name: "Coinbase" },
        { name: "Kraken" },
        { name: "Gemini" },
      ];
      await Exchange.insertMany(seedExchanges);
      dbExchanges = await Exchange.find();
      console.log("[Exchange Seed] MongoDB was empty, seeded exchanges:", seedExchanges);
    }

    const result = [];

    for (const ex of dbExchanges) {
      const exchangeId = ex.name.toLowerCase();
      let symbols = [];

      // Only fetch symbols if CCXT has the exchange
      if (ccxt[exchangeId]) {
        try {
          const ccxtEx = new ccxt[exchangeId]();
          await ccxtEx.loadMarkets();
          symbols = ccxtEx.symbols.filter((s) => s.includes("USD"));
        } catch (err) {
          console.warn(`[CCXT Error] ${ex.name}:`, err.message);
        }
      }

      result.push({
        name: ex.name,
        symbols,
      });
    }

    res.json({ success: true, exchanges: result });
  } catch (err) {
    console.error("[Exchanges Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
