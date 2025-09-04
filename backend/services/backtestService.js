export async function runBacktest({
  userId,
  strategyId = null,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  slippageBps = 5,
  limit = 2000,
  startDate = null,   // ✅ NEW
  endDate = null      // ✅ NEW
} = {}) {
  let candles = [];

  try {
    if (startDate && endDate) {
      // ✅ Query DB by date range
      candles = await Price.find({
        symbol,
        timeframe,
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }).sort({ timestamp: 1 }).lean();

      candles = candles.map(c => ({
        time: c.timestamp,
        price: c.close
      }));
    } else {
      // ✅ Fallback to limit-based fetch
      candles = await fetchOHLCVMulti(symbol, timeframe, limit);
    }
  } catch (err) {
    console.error(`[Backtest] Failed to fetch OHLCV for ${symbol}:`, err.message);
    return {
      saved: null,
      metrics: {
        initialBalance,
        finalBalance: initialBalance,
        netProfit: 0,
        winRate: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        cagr: 0,
        tradesCount: 0,
      },
      equityCurve: [],
      trades: []
    };
  }

  // ⚡️ The rest of your backtest logic stays exactly the same
}
