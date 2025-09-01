// File: backend/seeds/seedExchanges.js
import mongoose from "mongoose";
import Exchange from "../dbStructure/exchange.js";
import ccxt from "ccxt";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/neoV6DB";

// US-based exchanges we want to seed
const US_EXCHANGES = [
  { name: "Coinbase", ccxtId: "coinbase" },
  { name: "CoinbasePro", ccxtId: "coinbasepro" },
  { name: "Kraken", ccxtId: "kraken" },
  { name: "Gemini", ccxtId: "gemini" },
];

async function seedExchanges() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    for (const ex of US_EXCHANGES) {
      // Check if exchange already exists
      const exists = await Exchange.findOne({ name: ex.name });
      if (exists) {
        console.log(`ℹ️  ${ex.name} already exists, skipping`);
        continue;
      }

      // Optional: fetch symbols via CCXT
      let symbols = [];
      if (ccxt[ex.ccxtId]) {
        try {
          const ccxtEx = new ccxt[ex.ccxtId]();
          await ccxtEx.loadMarkets();
          symbols = ccxtEx.symbols.filter((s) => s.includes("USD"));
        } catch (err) {
          console.warn(`[CCXT Warning] ${ex.name}: ${err.message}`);
        }
      }

      // Create exchange in DB
      await Exchange.create({
        name: ex.name,
        apiKey: "",       // leave blank, fill in production if needed
        secret: "",       // leave blank, fill in production if needed
        baseUrl: "",      // optional
      });

      console.log(`✅ Added ${ex.name} with ${symbols.length} USD symbols`);
    }

    console.log("🎉 Exchange seeding complete!");
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    mongoose.connection.close();
  }
}

seedExchanges();
