const express = require('express');
const { protect } = require('../middleware/authMiddleware');

const authRoutes = require('./authRoutes');
const botRoutes = require('./botRoutes');
const userRoutes = require('./userRoutes');
const logRoutes = require('./logRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/bot', protect, botRoutes);
router.use('/user', protect, userRoutes);
router.use('/logs', protect, logRoutes);

module.exports = router;
