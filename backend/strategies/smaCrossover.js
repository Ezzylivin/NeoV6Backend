// File: backend/strategies/smaCrossover.js
export const smaCrossoverStrategy = {
  name: "SMA Crossover",
  description: "A simple moving average crossover strategy.",
  
  // Defines the parameters this strategy needs
  parameters: [
    { name: 'fast', type: 'number', default: 10 },
    { name: 'slow', type: 'number', default: 20 },
  ],

  // The core execution logic
  execute(index, indicators, params) {
    const fast = indicators.fast[index];
    const slow = indicators.slow[index];
    const prevFast = indicators.fast[index - 1];
    const prevSlow = indicators.slow[index - 1];
    
    if (fast === null || slow === null || prevFast === null || prevSlow === null) return null;
    if (prevFast <= prevSlow && fast > slow) return "BUY";
    if (prevFast >= prevSlow && fast < slow) return "SELL";
    
    return null;
  }
};
