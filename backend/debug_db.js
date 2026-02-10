// File: src/backend/debug_db.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Bot from "./dbStructure/bot.js"; // Adjust path if needed

dotenv.config();

const USER_ID = "0x1589DB9ef013Bb3394089191E5b76E49af1AacB4";

const runDbDebug = async () => {
    console.log(`\n🔍 --- DATABASE DIAGNOSTIC START ---\n`);

    try {
        // 1. Connect
        if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI in .env");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("1️⃣  Connected to MongoDB.");

        // 2. Find Bot
        const bot = await Bot.findOne({ userId: USER_ID });
        if (!bot) throw new Error("Bot not found for this user.");
        console.log(`2️⃣  Found Bot ID: ${bot._id}`);

        // 3. FORCE UPDATE
        console.log("3️⃣  Attempting FORCE WRITE of dummy data...");
        
        const dummyCandles = [
            { time: "2024-01-01T00:00:00Z", open: 50000, high: 51000, low: 49000, close: 50500 },
            { time: "2024-01-01T01:00:00Z", open: 50500, high: 52000, low: 50000, close: 51500 }
        ];
        
        const dummyEquity = [
            { time: "2024-01-01T00:00:00Z", balance: 1000 },
            { time: "2024-01-01T01:00:00Z", balance: 1050 }
        ];

        bot.candles = dummyCandles;
        bot.equityCurve = dummyEquity;
        bot.currentBalance = 9999; // Distinct number to verify

        const savedBot = await bot.save();
        console.log("   ✅ Save Command Executed.");

        // 4. VERIFY READ
        const verifyBot = await Bot.findOne({ userId: USER_ID });
        console.log(`4️⃣  Verification Read:`);
        console.log(`   💰 Balance: ${verifyBot.currentBalance}`);
        console.log(`   🕯️  Candles in DB: ${verifyBot.candles.length}`);

        if (verifyBot.candles.length === 2) {
            console.log("\n   ✅ SUCCESS: Database is accepting data.");
        } else {
            console.error("\n   ❌ FAILURE: Database did not persist the candles.");
        }

    } catch (error) {
        console.error(`\n   ❌ ERROR: ${error.message}`);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔍 --- DIAGNOSTIC COMPLETE ---");
    }
};

runDbDebug();
