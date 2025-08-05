const express = require('express');
const router = express.Router();

// Import the controller that contains the registration logic
const { registerUser, loginUser } = require('../controllers/authController');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerUser);

// You would also define other auth-related routes here
router.post('/login', loginUser);


module.exports = router;
