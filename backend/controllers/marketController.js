import axios from "axios";

// 🟢 Fetch Historical Candles (OHLCV) - Uses Binance.US (US Regulated)
export const getCandlesController = async (req, res) => {
    try {
        const { symbol, timeframe, limit } = req.query;
        
        // 1. Format Symbol for US Exchange (BTC-USD -> BTCUSD)
        // Binance.US supports direct USD pairs, unlike the global site which relies on USDT
        const usSymbol = symbol.replace('-', '').toUpperCase(); // e.g. "BTCUSD"

        const response = await axios.get('https://api.binance.us/api/v3/klines', {
            params: {
                symbol: usSymbol,
                interval: timeframe || '1h',
                limit: limit || 100
            }
        });

        // Format for Lightweight Charts: { time, open, high, low, close }
        // Binance.US returns array of arrays: [ [time, open, high, low, close, vol...], ... ]
        const formattedData = response.data.map(d => ({
            time: d[0] / 1000, // Unix Timestamp (Seconds)
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
        }));

        res.json(formattedData);
    } catch (error) {
        console.error("US Market Data Error:", error.message);
        // Fallback: Return empty array so frontend doesn't crash
        res.status(200).json([]); 
    }
};

// 🟢 Fetch Current Price - Uses Binance.US
export const getPriceController = async (req, res) => {
    try {
        const { symbol } = req.query;
        // Format: BTC-USD -> BTCUSD
        const usSymbol = symbol.replace('-', '').toUpperCase();
        
        const response = await axios.get('https://api.binance.us/api/v3/ticker/price', {
            params: { symbol: usSymbol }
        });

        res.json({ price: parseFloat(response.data.price) });
    } catch (error) {
        console.error("US Price Fetch Error:", error.message);
        res.status(500).json({ price: 0 });
    }
};
