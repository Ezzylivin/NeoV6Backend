// File: src/backend/server.js (With Wildcard Subdomain CORS)

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


// 1. Define the dynamic CORS options object.
 const corsOptions = {
  /**
   * The origin property is a function that determines if a request's
   * origin is allowed.
   * @param {string} origin - The 'Origin' header from the incoming request.
   * @param {function} callback - The function to call when we're done.
   */
  origin: function (origin, callback) {
    // Case 1: Allow requests that have no origin (e.g., Postman, mobile apps, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Case 2: Allow your specific local development URLs
    if (origin === 'http://localhost:8000' || origin === 'http://localhost:5173') {
      return callback(null, true);
    }

    // Case 3: Check if the origin is a .vercel.app subdomain using a Regular Expression
    // This will match https://anything-here.vercel.app
    const vercelRegex = /^https:\/\/.*\.vercel\.app$/;
    if (vercelRegex.test(origin)) {
      return callback(null, true); // The origin matches the pattern, so allow it.
    }

    // Case 4: If none of the above conditions are met, reject the request.
    return callback(new Error('This origin is not allowed by CORS'));
  },
  optionsSuccessStatus: 200
};
// 2. Use the single, dynamic CORS middleware for all requests.



app.use(cors(corsOptions));

// 3. Enable the middleware to parse incoming JSON payloads.
app.use(express.json());


// --- API Routes ---
app.use('/auth', apiRoutes);


// --- Start the Server ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
