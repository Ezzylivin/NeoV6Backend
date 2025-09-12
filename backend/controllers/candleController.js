import { fetchOHLCVMultiSafe } from '../services/candleService.js';

/**
 * Controller to handle requests for candle (OHLCV) data.
 * It acts as a bridge between the HTTP request and the candleService.
 */
export const getCandles = async (req, res) => {
  try {
    // 1. Extract and validate parameters from the incoming request query.
    const { 
      symbol, 
      timeframe, 
      limit, 
      startDate, 
      endDate, 
      exchangeId 
    } = req.query;

    // Symbol and timeframe are the bare minimum requirements for a valid request.
    if (!symbol || !timeframe) {
      return res.status(400).json({ 
        message: 'Request failed. "symbol" and "timeframe" query parameters are required.' 
      });
    }

    // 2. Call the service layer to perform the complex logic of fetching data.
    // We pass the validated and parsed parameters to the service.
    // The 'limit' parameter is parsed to an integer, as query params are strings.
    const result = await fetchOHLCVMultiSafe(
      symbol,
      timeframe,
      limit ? parseInt(limit, 10) : undefined,
      startDate,
      endDate,
      exchangeId // The service already provides a default ('binance') if this is undefined
    );

    // 3. Send a successful response back to the client with the fetched data.
    res.status(200).json(result);

  } catch (error) {
    // 4. If the service layer throws an error (e.g., exchange not found, symbol invalid),
    // catch it here, log it for debugging, and send a user-friendly error response.
    console.error(`[candleController] Error fetching candles: ${error.message}`);
    
    // Send a 500 Internal Server Error status, but with the specific message from the service.
    res.status(500).json({ 
      message: error.message || "An unexpected error occurred while fetching candle data." 
    });
  }
};
