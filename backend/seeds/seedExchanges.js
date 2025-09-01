// File: backend/seeds/seedExchanges.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Exchange from "../dbStructure/exchange.js";

dotenv.config();

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/neo-v6";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected for seeding"))
  .catch(err => console.error("MongoDB connection error:", err));

const seedExchanges = async () => {
  try {
    const defaultExchanges = [
      { name: "binance", apiKey: "", secret: "", baseUrl: "" },
      { name: "coinbase", apiKey: "", secret: "", baseUrl: "" },
      { name: "kraken", apiKey: "", secret: "", baseUrl: "" },
      { name: "gemini", apiKey: "", secret: "", baseUrl: "" },
    ];

    // Remove old entries (optional)
    await Exchange.deleteMany({});
    // Insert defaults
    const inserted = await Exchange.insertMany(defaultExchanges);

    console.log("Exchanges seeded:", inserted.map(e => e.name));
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
};

seedExchanges();
