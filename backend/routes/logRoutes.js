import express from 'express';
import { getLogs, createLog } from '../controllers/logController.js';


const router = express.Router();

// GET logs — Admin sees all, user sees only their own
router.get('/get', getLogs);

// POST a new log
router.post('/create', createLog);

export default router;
