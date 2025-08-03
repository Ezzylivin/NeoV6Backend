// File: backend/routes/api.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');

// Import all the sub-routers
const authRoutes = require('./authRoutes');
const botRoutes = require('./botRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

// Public routes (authentication)
router.use('/auth', authRoutes);

// Protected routes (require a valid login token)
router.use('/bot', protect, botRoutes);
router.use('/user', protect, userRoutes);

module.exports = router;

