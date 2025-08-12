// File: src/backend/server.js (The "Gold Standard" Version)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

// It should ONLY import the main apiRoutes switchboard.
import apiRoutes from './routes/apiRoutes.js'; 

// --- Initial Server Setup & Middleware ---
dotenv.config();
connectDB();
const app = express();
// ... your cors and express.json middleware ...

// --- API Routing ---
// This is the ONLY app.use() for routing you should have here.
app.use('/home', apiRoutes);

// --- Start the Server ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running...`);
});
