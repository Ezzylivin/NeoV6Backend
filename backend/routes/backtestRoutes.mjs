// File: backend/routes/backtestSetupRoutes.js
// NEW: This router defines the API endpoints for managing saved backtest configurations.

import express from "express";
import {
  createSetup,
  getSetups,
  getSetupById,
  deleteSetup,
} from "../controllers/backtestSetupController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Define the routes for Backtest Setups ---

// POST /api/backtest-setups/ -> Create a new backtest setup
router.post("/", protect, createSetup);

// GET /api/backtest-setups/ -> Get all of the user's saved setups
router.get("/", protect, getSetups);

// GET /api/backtest-setups/:id -> Get a single setup by its ID
router.get("/:id", protect, getSetupById);

// DELETE /api/backtest-setups/:id -> Delete a setup by its ID
router.delete("/:id", protect, deleteSetup);

export default router;
```

### What to Do Next: Activate the New Routes

With the creation of this file, your backend logic is complete. The very final step is to tell your main server file (likely `app.js` or `server.js`) to use this new router.

You'll need to add two lines to that file: one to import the new router, and one to "mount" it at the correct API path. It will look like this:

```javascript
// In your main server file (e.g., app.js or server.js)

import backtestSetupRoutes from './routes/backtestSetupRoutes.js'; // 1. Import the new router

// ... other routes

// 2. Tell your app to use the new router for any path starting with /api/backtest-setups
app.use('/api/backtest-setups', backtestSetupRoutes);

