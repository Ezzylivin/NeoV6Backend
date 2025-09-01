import ccxt from "ccxt";

// US-based exchanges (CCXT)
const US_EXCHANGES = ["coinbase", "coinbasepro", "kraken", "gemini"];

export const getExchanges = async (req, res) => {
  try {
    const result = {};

    for (const id of US_EXCHANGES) {
      const ex = new ccxt[id]();
      await ex.loadMarkets(); // load available symbols
      result[id] = ex.symbols.filter((s) => s.includes("USD")); // only USD pairs
    }

    res.json(result);
  } catch (err) {
    console.error("Error fetching exchanges:", err);
    res.status(500).json({ error: "Failed to fetch exchanges" });
  }
};
