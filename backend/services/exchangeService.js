// File: backend/services/exchangeService.js
import ccxt from "ccxt";

// List of supported US-based exchanges
const US_EXCHANGES = ["coinbase", "coinbasepro", "kraken", "gemini"];

class ExchangeService {
  constructor(exchangeId, apiKey = "", apiSecret = "") {
    if (!US_EXCHANGES.includes(exchangeId)) {
      throw new Error(`Exchange "${exchangeId}" is not a supported US-based exchange`);
    }

    const ExchangeClass = ccxt[exchangeId];
    this.exchange = new ExchangeClass({
      apiKey,
      secret: apiSecret,
      options: { defaultType: "spot" },
    });
    this.exchangeId = exchangeId;
  }

  async fetchPrice(symbol) {
    const ticker = await this.exchange.fetchTicker(symbol);
    return ticker.last;
  }

  async placeOrder(symbol, side, amount) {
    console.log(`[${this.exchangeId}] Creating ${side} order for ${amount} of ${symbol}`);
    return await this.exchange.createMarketOrder(symbol, side.toLowerCase(), amount);
  }

  async fetchOHLCV(symbol, timeframe = "1h", limit = 100) {
    return await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  }

  // Note: watchOHLCV removed because it requires ccxt-pro
}

export default ExchangeService;
