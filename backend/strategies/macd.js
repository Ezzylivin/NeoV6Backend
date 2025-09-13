export const macdStrategy = {
  name: "MACD Crossover",
  requiredIndicators: (params) => [{ name: 'macd', type: 'MACD' }],
  getSignal: (indicatorData) => {
    const { macd, prevMacd } = indicatorData;
    if (!macd?.MACD || !macd?.signal || !prevMacd?.MACD || !prevMacd?.signal) return null;

    if (prevMacd.MACD <= prevMacd.signal && macd.MACD > macd.signal) return "BUY";
    if (prevMacd.MACD >= prevMacd.signal && macd.MACD < macd.signal) return "SELL";
    
    return null;
  }
};
