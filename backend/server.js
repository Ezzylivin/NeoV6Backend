import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import apiRoutes from "./routes/apiRoutes.js";
import { startPriceFeed, stopPriceFeed } from "./controllers/priceController.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// --- CORS setup ---
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8000",
  "http://localhost:3000", // common React dev port
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Development
    if (process.env.NODE_ENV === "development") {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    }
    
    // Production: more secure Vercel check
    if (process.env.NODE_ENV === "production") {
      const allowedDomains = [
        '.vercel.app',
        process.env.FRONTEND_URL // add your specific frontend URL
      ].filter(Boolean);
      
      if (allowedDomains.some(domain => origin.endsWith(domain))) {
        return callback(null, true);
      }
    }
    
    console.warn(`🚫 CORS blocked for origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// --- Security headers ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// --- Request logging middleware ---
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// --- JSON parser with increased payload limit ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- Health check endpoint ---
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// --- Mount API routes ---
app.use("/api", apiRoutes);

// --- Serve static files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- 404 handler ---
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// --- Global error handler ---
app.use((error, req, res, next) => {
  console.error('🔥 Global Error:', error);
  
  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

// --- Graceful shutdown ---
const gracefulShutdown = async (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop price feed
    if (stopPriceFeed) {
      console.log('🔄 Stopping price feed...');
      await stopPriceFeed();
    }
    
    // Close MongoDB connection
    console.log('🔄 Closing MongoDB connection...');
    await mongoose.connection.close();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// --- Start MongoDB + server ---
const startServer = async () => {
  try {
    // Set mongoose options
    mongoose.set('strictQuery', false);
    
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    });
    
    console.log("✅ MongoDB connected");
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);

    // Start background price feed
    try {
      console.log('🔄 Starting price feed...');
      await startPriceFeed();
      console.log('✅ Price feed started');
    } catch (priceError) {
      console.error('⚠️ Price feed failed to start:', priceError.message);
      // Don't exit - server can still function without price feed
    }

    const PORT = process.env.PORT || 8000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (err) {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();
