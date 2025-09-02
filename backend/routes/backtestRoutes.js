// src/backend/routes/backtestRoutes.js (example)
import express from 'express';
import {
  runAndSaveBacktests,
  runBatchBacktestsController,
  getUserBacktests,
  getBacktestOptions
} from '../controllers/backtestController.js';

const router = express.Router();

router.get('/options', getBacktestOptions);
router.post('/run', runAndSaveBacktests);
router.post('/batch', runBatchBacktestsController);
router.get('/user/:userId', getUserBacktests);

export default router;
