// File: src/backend/server.js (Corrected and Final Version)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

// Import the main switchboard for all API routes
import apiRoutes from './routes/apiRoutes.js';

// --- Initial Server Setup ---
dotenv.config();
connectDB();
const app = express();


// --- Middleware Configuration ---

// 1. Define the list of allowed origins (your frontend URLs).
const whitelist = [
  'http://localhost:3000', // For local development (Vite's default port)
  'http://localhost:5173', // Vite's other common port
  'https://neov6.vercel.app' // Your deployed production frontend
];

// 2. Create the dynamic CORS options object.
const dynamicCorsOptions = {
  origin: function (origin, callback) {
    // Check if the incoming origin is in our whitelist.
    // The '!origin' part allows requests with no origin (like from Postman or server-to-server).
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      // If the origin is not in the whitelist, reject the request.
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

// 3. Use the single, dynamic CORS middleware for all requests.
app.use(cors(dynamicCorsOptions));

// 4. Enable the middleware to parse incoming JSON payloads.
//    This should generally come AFTER your CORS configuration.
app.use(express.json());


// --- API Routes ---

// 5. Mount the main API switchboard. (Using /api is recommended over /api/routes).
app.use('/api', apiRoutes);


// --- Start the Server ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
