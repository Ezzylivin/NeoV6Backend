import express from 'express';
// Import the specific controller function
import { registerUser } from '../controllers/authController.js'; 

const router = express.Router();

// The route now just points to the imported controller function
router.post('/register', registerUser);

// You could add a login route here pointing to a 'loginUser' controller
// router.post('/login', loginUser);

export default router;
