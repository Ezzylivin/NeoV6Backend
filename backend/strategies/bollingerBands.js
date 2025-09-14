export const bollingerBandsStrategy = {
  name: "Bollinger Bands Mean Reversion",
  requiredIndicators: (params) => [{ name: 'bbands', type: 'BBANDS', period: params.period, stdDev: params.stdDev }],
  // The 'candle' parameter is provided by the backtest engine
  getSignal: (indicatorData, params, candle) => { 
    const { bbands } = indicatorData;
    if (!bbands?.lower || !bbands?.upper) return null;

    // Buy when price drops below the lower band, expecting a reversion back up.
    if (candle.close < bbands.lower) return "BUY"; 
    
    // Sell when price spikes above the upper band, expecting a reversion back down.
    if (candle.close > bbands.upper) return "SELL";
    
    return null;
  }
};
