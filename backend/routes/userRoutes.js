import express from 'express';
import { registerUser, loginUser, getMe, updateApiKeys } from '../controllers/userController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser); // <-- This line creates the /login route

router.use(protect); // Protect routes below this line
router.get('/me', getMe);
router.post('/keys', updateApiKeys);

export default router;
