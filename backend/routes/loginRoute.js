// File: backend/routes/loginRoute.js
import express from 'express';
import jwt from 'jsonwebtoken';
import user from '../dbStructure/userl.js';

const router = express.Router();

const token = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await user.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  res.json({
    access_token: token(user._id),
    user: { id: user._id, email: user.email, role: user.role }
  });
});

export default router;
