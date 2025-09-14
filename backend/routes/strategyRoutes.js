import express from 'express';
import { createStrategy, updateStrategy, getUserStrategies, deleteStrategy } from '../controllers/strategyController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
  .post(createStrategy)    // POST /api/strategy
  .get(getUserStrategies); // GET /api/strategy

router.route('/:id')
  .put(updateStrategy)     // PUT /api/strategy/:id
  .delete(deleteStrategy); // DELETE /api/strategy/:id

export default router;
