import express from 'express';
import { getLogs, createLog } from '../controllers/logController.js';


const router = express.Router();

// GET logs — Admin sees all, user sees only their own
router.get('/logs/get', getLogs);

// POST a new log
router.post('/logs/create', createLog);

export default router;
