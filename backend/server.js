import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes from "./routes/apiRoutes.js";


dotenv.config();
const app = express();

// --- Middleware ---

// --- CORS Configuration ---
// This setup is necessary to allow your Vercel frontend to communicate
// with your Render backend, especially when sending credentials.
const corsOptions = {
  // The origin property checks where the request is coming from.
  // We use a function here to dynamically check if the request origin
  // ends with '.vercel.app'.
  origin: function (origin, callback) {
    // The '!origin' check allows requests from tools like Postman or Postwoman
    // where the origin header might not be present.
    // The regex /\.vercel\.app$/ checks if the origin string ends with '.vercel.app'.
    if (!origin || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  // credentials: true is crucial. It tells the browser that the server
  // allows cookies and authorization headers to be sent from the frontend.
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
