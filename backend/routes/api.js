// File: backend/routes/api.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import botRoutes from './botRoutes.js';
import logRoutes from './logRoutes.js';

const router = express.Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use('/bot', protect, botRoutes);
router.use('/user', protect, userRoutes);
router.use('/logs', protect, logRoutes);

// Optional role-based example
// import { adminMiddleware } from '../middleware/adminMiddleware.js';
// import adminRoutes from './adminRoutes.js';
// router.use('/admin', protect, adminMiddleware, adminRoutes);

export default router;
