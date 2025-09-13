// File: backend/routes/userRoutes.js
import express from 'express';
import { 
    registerUser, 
    loginUser, 
    getMe, 
    updateApiKeys // Import the new controller function
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes
router.get('/me', protect, getMe);
router.post('/keys', protect, updateApiKeys); // <-- New route for API keys

export default router;
