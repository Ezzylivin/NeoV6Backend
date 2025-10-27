// File: backend/utils/loadSamplePrices.js
import mongoose from 'mongoose';
import Price from '../dbStructure/price.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/neov6';

async function loadSampleData() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Clear existing sample data
    await Price.deleteMany({ symbol: { $in: ['BTCUSDT','ETHUSDT','BNBUSDT'] } });

    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    const now = new Date();

    const data = [];

    symbols.forEach(symbol => {
      for (let i = 0; i < 100; i++) { // 100 candles
        const timestamp = new Date(now.getTime() - (100-i) * 60 * 1000); // 1-minute intervals
        const close = +(Math.random() * 100 + 1000).toFixed(2); // random price between 1000–1100
        data.push({
          symbol,
          timestamp,
          open: close - Math.random()*5,
          high: close + Math.random()*5,
          low: close - Math.random()*5,
          close,
          volume: Math.floor(Math.random()*100),
        });
      }
    });

    await Price.insertMany(data);
    console.log('Sample historical data loaded successfully!');
    mongoose.disconnect();
  } catch (err) {
    console.error('Error loading sample data:', err);
  }
}

loadSampleData();
