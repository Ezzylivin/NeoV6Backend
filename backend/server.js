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
    const vercelRegex = /^https:\/\/.*\.vercel\.app$/;
    const netlifyRegex = /^https:\/\/.*\.netlify\.app$/;

    if (!origin || whitelist.indexOf(origin) !== -1 || vercelRegex.test(origin) || netlifyRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

// This is the correct order for your middleware
app.options('*', cors(corsOptions)); // Handle pre-flight requests
app.use(cors(corsOptions));     // Handle all other requests
app.use(express.json());       // Parse JSON bodies


// --- API Routes ---
// This comes AFTER all the global middleware.
app.use('/api', apiRoutes); // Or '/home' if you prefer that prefix


// --- Start the Server ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
