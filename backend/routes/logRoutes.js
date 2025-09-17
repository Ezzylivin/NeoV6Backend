// File: backend/routes/logRoutes.js
import express from 'express';
import { getLogs, createLog } from '../controllers/logController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all log routes; a user must be logged in.
router.use(protect);

// Define the routes using a chained .route() for cleanliness
router.route('/')
  .get(getLogs)      // Handles GET /api/logs
  .post(createLog);  // Handles POST /api/logs

export default router;
