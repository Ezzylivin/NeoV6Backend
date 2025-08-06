import express from 'express';
import { getLogs, createLog } from '../controllers/logController.js';
import { protect } from '../middleware/authMiddleware.js'; // Make sure this exists

const router = express.Router();

// GET logs — Admin sees all, user sees only their own
router.get('/', protect, getLogs);

// POST a new log
router.post('/', protect, createLog);

export default router;
