import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import mountApiRoutes from "./routes/apiRoutes.js";
import priceRoutes from "./routes/priceRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";

dotenv.config();
const app = express();

// --- Dynamic CORS ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, mobile apps

    if (process.env.NODE_ENV === "development") {
      const allowedLocalOrigins = ["http://localhost:5173"];
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
    }

    if (process.env.NODE_ENV === "production") {
      const prodDomain = process.env.PROD_DOMAIN || "render.com";
      const domainRegex = new RegExp(`^https:\\/\\/.*\\.${prodDomain}$`);
      if (domainRegex.test(origin)) return callback(null, true);
    }

    return callback(new Error("CORS not allowed"));
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// --- Mount routes asynchronously ---
(async () => {
  const apiRouter = await mountApiRoutes();
  app.use("/api", apiRouter);
})();

app.use("/api/prices", priceRoutes);

// --- Start server + MongoDB ---
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");

    startPriceFeed();

    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

startServer();
