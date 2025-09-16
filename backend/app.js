// File: backend/app.js

import express from "express";
import cors from "cors";
import apiRoutes from './routes/apiRoutes.js';

const app = express();

// --- FLEXIBLE CORS SETUP ---
const corsOptions = {
    origin: function (origin, callback) {
        const vercelRegex = /\.vercel\.app$/;
        const netlifyRegex = /\.netlify\.app$/;
        if (!origin || origin.startsWith("http://localhost") || vercelRegex.test(origin) || netlifyRegex.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Request from this origin is not allowed by CORS"));
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- MOUNT ALL API ROUTES ---
app.use("/api", apiRoutes);

export default app; // Export the app instance
