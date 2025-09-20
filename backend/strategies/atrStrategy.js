// File: backend/strategies/atrStrategy.js

// ATR calculation helper
const calculateATR = (candles, period) => {
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i][2];
        const low = candles[i][3];
        const prevClose = candles[i-1][4];
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }
    
    if (trs.length < period) return null;

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += trs[i];
    }
    return sum / period;
};


export function atrStrategy(candles, params) {
    const { atrPeriod = 14, atrMultiplier = 2.0 } = params;
    const trades = [];

    // ✅ FIXED: Extract high, low, and close prices from the raw candles data.
    // The candles array has the structure: [timestamp, open, high, low, close]
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]); // This line defines the missing 'closes' variable

    if (candles.length < atrPeriod) return trades;

    for (let i = atrPeriod; i < candles.length; i++) {
        const atrCandles = candles.slice(i - atrPeriod, i + 1);
        const atr = calculateATR(atrCandles, atrPeriod);
        if (atr === null) continue;

        const prevClose = closes[i - 1];
        const currentHigh = highs[i];
        const currentLow = lows[i];

        const upperBand = prevClose + (atr * atrMultiplier);
        const lowerBand = prevClose - (atr * atrMultiplier);

        // --- Entry and Exit Logic ---
        let position = trades.length > 0 ? trades[trades.length - 1].position : null;

        if (!position) { // If not in a position, look for an entry
            if (currentHigh > upperBand) {
                trades.push({
                    entryTimestamp: candles[i][0],
                    entryPrice: upperBand,
                    signal: 'buy',
                    position: 'long'
                });
            }
        } else if (position === 'long') { // If in a long position, look for an exit
            if (currentLow < lowerBand) {
                 const entryTrade = trades[trades.length - 1];
                 entryTrade.exitTimestamp = candles[i][0];
                 entryTrade.exitPrice = lowerBand;
                 entryTrade.profit = entryTrade.exitPrice - entryTrade.entryPrice;
                 entryTrade.position = null; // Mark position as closed
            }
        }
    }

    return trades;
}
