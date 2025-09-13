export const bollingerBandsStrategy = {
  name: "Bollinger Bands Mean Reversion",
  requiredIndicators: (params) => [{ name: 'bbands', type: 'BBANDS', period: params.period, stdDev: params.stdDev }],
  getSignal: (indicatorData, params, candle) => {
    const { bbands } = indicatorData;
    if (!bbands?.lower || !bbands?.upper) return null;

    if (candle.close < bbands.lower) return "BUY"; // Price dropped below lower band, expect reversion
    if (candle.close > bbands.upper) return "SELL"; // Price spiked above upper band, expect reversion
    
    return null;
  }
};
