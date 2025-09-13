export const stochasticStrategy = {
  name: "Stochastic Oscillator",
  requiredIndicators: (params) => [{ name: 'stoch', type: 'STOCH' }],
  getSignal: (indicatorData, params) => {
    const { stoch, prevStoch } = indicatorData;
    const oversold = params.oversold || 20;
    const overbought = params.overbought || 80;

    if (!stoch?.K || !stoch?.D || !prevStoch?.K || !prevStoch?.D) return null;

    if (prevStoch.K <= oversold && stoch.K > oversold) return "BUY";
    if (prevStoch.K >= overbought && stoch.K < overbought) return "SELL";
    
    return null;
  }
};
