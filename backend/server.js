// File: src/backend/server.js (The Complete and Final Version)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import apiRoutes from './routes/apiRoutes.js';

// --- Initial Server Setup ---
dotenv.config();
connectDB();
const app = express();

// --- Middleware Configuration ---

const corsOptions = {
  origin: function (origin, callback) {
    const whitelist = ['http://localhost:3000', 'http://localhost:5173'];
    const vercelRegex = /^https:\/\/.*\.vercel\.app$/; // This will match your preview URL

    if (!origin || whitelist.indexOf(origin) !== -1 || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by CORS'));
    }
  }
};

// THIS IS THE CRUCIAL ORDER
// 1. Handle pre-flight requests for all routes
app.options('*', cors(corsOptions));

// 2. Handle all other requests
app.use(cors(corsOptions));

// 3. The JSON parser comes AFTER CORS
app.use(express.json());

// 4. Your API routes are last
app.use('/api', apiRoutes); // Or '/home' if you prefer that prefix


// --- Start the Server ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
