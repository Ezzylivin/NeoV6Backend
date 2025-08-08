// File: backend/services/exchangeService.js
import ccxt from 'ccxt';

class ExchangeService {
  constructor(apiKey, apiSecret /*, mode is no longer needed*/ ) {
    const exchangeId = 'binance';
    const exchangeClass = ccxt[exchangeId]; // Use ccxt (no pro)

    this.exchange = new exchangeClass({
      apiKey,
      secret: apiSecret,
      options: { defaultType: 'spot' },
    });
  }

  async fetchPrice(symbol) {
    const ticker = await this.exchange.fetchTicker(symbol);
    return ticker.last;
  }

  async placeOrder(symbol, side, amount) {
    console.log(`[Exchange] Creating ${side} order for ${amount} of ${symbol}`);
    return await this.exchange.createMarketOrder(symbol, side.toLowerCase(), amount);
  }

  async fetchOHLCV(symbol, timeframe = '1h', limit = 100) {
    return await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  }

  // watchOHLCV removed since it relies on ccxt-pro
}
export default ExchangeService;
