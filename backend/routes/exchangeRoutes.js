// File: backend/routes/exchangeRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { saveExchangeKey, getExchangeKeys } from '../controllers/exchangeController.js';

const router = express.Router();

// Save user's exchange keys
router.post('/keys',  verifyToken, saveExchangeKey);

// Get user's exchange keys
router.get('/keys',  verifyToken, getExchangeKeys);

export default router;
