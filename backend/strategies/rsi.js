// File: backend/strategies/rsi.js
export const rsiStrategy = {
  name: "RSI",
  
  requiredIndicators: (params) => [
    { name: 'rsi', type: 'RSI', period: params.period || 14 },
  ],

  getSignal: (indicatorData, params) => {
    const { rsi, prevRsi } = indicatorData;
    const oversold = params.oversold || 30;
    const overbought = params.overbought || 70;

    if (rsi === null || prevRsi === null) return null;
    
    if (prevRsi <= oversold && rsi > oversold) return "BUY";
    if (prevRsi >= overbought && rsi < overbought) return "SELL";
    
    return null;
  }
};
