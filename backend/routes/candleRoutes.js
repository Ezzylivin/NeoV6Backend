import express from "express";
import ccxt from "ccxt";

// Import your other route files if you have them
// For example:
// import userRoutes from './userRoutes.js';

const router = express.Router();

// --- Re-implemented Candle Data Route ---
router.get("/candles", async (req, res) => {
  // 1. Extract the query parameters from the URL
  const { exchange, symbol, timeframe } = req.query;

  // 2. Basic validation to ensure we have what we need
  if (!exchange || !symbol || !timeframe) {
    return res.status(400).json({ 
      message: "Missing required query parameters: exchange, symbol, timeframe" 
    });
  }

  try {
    // 3. Check if the requested exchange is available in CCXT
    if (!ccxt.hasOwnProperty(exchange)) {
      return res.status(404).json({ message: `Exchange '${exchange}' not found.` });
    }

    // 4. Initialize the exchange instance
    const exchangeInstance = new ccxt[exchange]();

    // 5. Fetch the OHLCV (Open, High, Low, Close, Volume) data
    // The 'since' parameter is set to undefined to get the most recent data
    // The 'limit' parameter fetches the last 100 candles. Adjust if needed.
    const candles = await exchangeInstance.fetchOHLCV(symbol, timeframe, undefined, 100);
    
    // 6. Send the successfully fetched data back to the frontend
    res.json(candles);

  } catch (error) {
    // 7. If anything goes wrong (e.g., symbol not found, exchange API down),
    // send a detailed error message.
    console.error(`Error fetching candles for ${symbol} on ${exchange}:`, error.message);
    res.status(500).json({ 
      message: `Failed to fetch candle data from ${exchange}.`,
      error: error.message 
    });
  }
});


// --- Your Other Routes ---
// If you have a user router, it would be used here like this:
// router.use('/users', userRoutes);
// Make sure to add any other routes you need for your application.


export default router;
