// File: backend/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// --- Route Imports ---
import userRoutes from "./routes/userRoutes.js";
import comboStrategyRoutes from "./routes/comboStrategyRoutes.js";
import backtestRoutes from "./routes/backtestRoutes.mjs"; // Ensure extension matches your file
import backtestSetupRoutes from "./routes/backtestSetupRoutes.js";
import botRoutes from "./routes/botRoutes.js";
import marketRoutes from "./routes/marketRoutes.js";
import mlRoutes from "./routes/mlRoutes.js";
import helpRoutes from "./routes/helpRoutes.js";
import ledgerRoutes from "./routes/ledgerRoutes.js"; // 🧠 Trade Learning Ledger proxy
import fleetRoutes from "./routes/fleetRoutes.js"; // 🚢 Fleet orchestration proxy

const app = express();

// Render (and most PaaS) put this app behind a reverse proxy that sets
// X-Forwarded-For. Trust the first proxy hop so req.ip is the real client IP —
// without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on
// the rate-limited auth routes. '1' = trust exactly one proxy (Render's LB), which
// is safer than `true` (trust all, spoofable).
app.set("trust proxy", 1);

// --- Security headers ---
app.use(helmet());

// --- Rate limiter for auth endpoints (throttle credential brute-force) ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// --- CORS Configuration ---
// SECURITY (BE#5): prefer an exact-match allowlist from ALLOWED_ORIGINS
// (comma-separated) so production can lock CORS to the app's own domains.
// Falls back to the loose *.vercel.app rule only when no allowlist is set.
// Read env lazily per-request: app.js is imported before dotenv runs, so a
// module-load read could miss a local .env value.
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);

    const exact = (process.env.ALLOWED_ORIGINS || "")
      .split(",").map((o) => o.trim()).filter(Boolean);
    const allowed = exact.length
      ? exact.includes(origin)
      : /\.vercel\.app$/.test(origin); // fallback until ALLOWED_ORIGINS is set

    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error("Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- API Route Mounting ---
app.use("/api/users", authLimiter, userRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/combos", comboStrategyRoutes);
app.use("/api/backtest", backtestRoutes);
app.use("/api/backtestSetups", backtestSetupRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/market", marketRoutes); // 🟢 Fixes chart 404
app.use("/api/ml", mlRoutes);
app.use("/api/ledger", ledgerRoutes); // 🧠 Proxies the Python engine's ledger over HTTPS
app.use("/api/fleet", fleetRoutes); // 🚢 Proxies the Python engine's fleet orchestration over HTTPS

// --- Health Check ---
app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
