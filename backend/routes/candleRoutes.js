import express from "express";
import { getCandles } from '../controllers/candleController.js';

// If you have other controllers for different features, you would import them here.
// For example:
// import { loginUser, registerUser } from '../controllers/userController.js';

const router = express.Router();

// --- Candle Data Route ---
// This is the upgraded part. Its only job is to connect the URL 
// to the correct controller function. All the complex logic is now
// handled by the controller and the service.
router.get('/candles', getCandles);


// --- Other Application Routes ---
// This is where you would add routes for users, bots, etc.
// For example:
// router.post('/users/login', loginUser);
// router.post('/users/register', registerUser);


export default router;
