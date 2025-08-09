// File: backend/routes/exchangeRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { saveExchangeKey, getExchangeKeys } from '../controllers/exchangeController.js';

const router = express.Router();

// Save user's exchange keys
router.post('/', protect, saveExchangeKey);

// Get user's exchange keys
router.get('/', protect, getExchangeKeys);

export default router;
