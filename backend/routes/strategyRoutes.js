// File: backend/routes/strategyRoutes.js
import express from 'express';
import {
  upsertStrategy, getUserStrategies, getStrategyById, deleteStrategy
} from '../controllers/strategyController.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

// Protect all strategy routes
router.use(protect);

router.route('/')
  .post(upsertStrategy)
  .get(getUserStrategies);

router.route('/:id')
  .get(getStrategyById)
  .delete(deleteStrategy);

export default router;
