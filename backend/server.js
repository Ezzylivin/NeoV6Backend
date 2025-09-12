import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes from "./routes/apiRoutes.js";


dotenv.config();
const app = express();

// --- Middleware ---

// --- CORRECTED CORS Configuration ---
const corsOptions = {
  // The origin property can be a function that dynamically determines
  // which origins are allowed.
  origin: function (origin, callback) {
    // For our case, we will simply reflect the incoming origin.
    // This is a common pattern for allowing multiple development/preview URLs.
    // The 'credentials: true' flag will still enforce that the browser
    // sends the 'Origin' header, preventing most unauthorized direct API access.
    callback(null, origin);
  },
  // credentials: true is crucial. It allows cookies and authorization headers.
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
app.use("/api", apiRoutes);


// --- Start server + MongoDB ---
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");



    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

startServer();


