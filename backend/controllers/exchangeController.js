// File: src/backend/controllers/exchangeController.js
import Exchange from "../dbStructure/exchange.js";
import ccxt from "ccxt";

/**
 * GET /api/exchanges
 * Returns exchanges from DB (if available) or fallback US exchanges with USD trading pairs
 */
export const getExchanges = async (req, res) => {
  try {
    // 1️⃣ Try pulling from MongoDB
    const dbExchanges = await Exchange.find(); // [{ name, apiKey, secret, baseUrl }, ...]

    // Decide what exchanges to query
    let exchangesToLoad = [];

    if (dbExchanges.length > 0) {
      exchangesToLoad = dbExchanges.map((ex) => ex.name.toLowerCase());
    } else {
      // fallback if DB is empty
      exchangesToLoad = ["coinbase", "kraken", "gemini"];
    }

    const result = [];

    for (const id of exchangesToLoad) {
      try {
        if (!ccxt[id]) {
          console.warn(`[CCXT] Exchange not supported: ${id}`);
          continue;
        }

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
