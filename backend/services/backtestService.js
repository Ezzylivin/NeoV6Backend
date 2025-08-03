// File: backend/services/backtestService.js
const ExchangeService = require('./exchangeService');
const { crossoverStrategy } = require('./strategyEngine');

const runBacktest = async () => {
  console.log(`[Backtest] Starting...`);
  // Backtesting uses a public-only exchange instance, no keys needed
  const exchange = new ExchangeService();
  // Fetch 500 hours of historical Bitcoin data
  const historicalData = await exchange.fetchOHLCV('BTC/USDT', '1h', 500);
  
  let balance = 10000; // Starting USDT
  let trades = 0;
  let asset = 0; // Starting BTC

  for (const candle of historicalData) {
    const [timestamp, open, high, low, close, volume] = candle;
    
const recentCandles = historicalData.slice(0, historicalData.indexOf(candle) + 1);
const decision = crossoverStrategy(recentCandles);


 // Replace with your real strategy
    // =================================================================

    if (decision === 'BUY' && balance > close) {
      asset += balance / close; // Use all balance to buy
      balance = 0;
      trades++;
    } else if (decision === 'SELL' && asset > 0) {
      balance += asset * close; // Sell all asset
      asset = 0;
      trades++;
    }
  }
  
  // At the end, calculate final portfolio value in USDT
  const finalValue = balance + (asset * historicalData[historicalData.length - 1][4]);

  console.log(`[Backtest] Finished. Final Value: ${finalValue.toFixed(2)} USDT`);
  return {
    initialBalance: 10000,
    finalBalance: finalValue.toFixed(2),
    totalTrades: trades,
    profit: (finalValue - 10000).toFixed(2),
    candlesTested: historicalData.length,
  };
};

module.exports = { runBacktest };

