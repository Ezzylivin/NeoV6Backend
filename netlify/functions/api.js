// File: netlify/functions/api.js

import serverless from "serverless-http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../../backend/app.js"; // Adjust path to your app.js

dotenv.config();

// Establish a cached connection
let cachedDb = null;

const connectToDatabase = async () => {
    if (cachedDb) {
        return cachedDb;
    }
    const db = await mongoose.connect(process.env.MONGO_URI);
    cachedDb = db;
    return db;
};

// Main handler
export const handler = async (event, context) => {
    // Ensure the database is connected
    await connectToDatabase();
    
    // Use serverless-http to handle the request with your Express app
    const handler = serverless(app);
    return await handler(event, context);
};
