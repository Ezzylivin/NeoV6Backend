// File: backend/services/register.js
import express from 'express';
import jwt from 'jsonwebtoken';
import user from '../dbStructure/user.js';

const router = express.Router();

// Generate JWT token
const token = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register a new user
router.post('/register', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Please enter all fields' });

  const userExists = await user.findOne({ email });
  if (userExists) return res.status(400).json({ message: 'User already exists' });

  try {
    const user = await user.create({ email, password });
    res.status(201).json({ access_token: token(user.id) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
