// File: backend/routes/cryptoRoutes.js
import express from 'express';
import { getSupportedSymbols } from '../controllers/cryptoController.js';

const router = express.Router();

// Get supported crypto pairs
router.get('/symbols', getSupportedSymbols);

export default router;
