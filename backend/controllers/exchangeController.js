// File: backend/controllers/exchangeController.js
import User from '../models/userModel.js';

// Save exchange keys to the user's profile
export const saveExchangeKey = async (req, res) => {
  const userId = req.user.id;
  const { exchange, apiKey, apiSecret } = req.body;

  if (!exchange || !apiKey || !apiSecret) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if keys for this exchange already exist
    const existingIndex = user.exchangeKeys.findIndex((e) => e.exchange === exchange);

    if (existingIndex !== -1) {
      // Update existing key
      user.exchangeKeys[existingIndex] = { exchange, apiKey, apiSecret };
    } else {
      // Add new key
      user.exchangeKeys.push({ exchange, apiKey, apiSecret });
    }

    await user.save();
    res.status(200).json({ message: 'Exchange keys saved successfully' });
  } catch (error) {
    console.error('Error saving exchange keys:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all exchange keys associated with the user
export const getExchangeKeys = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select('exchangeKeys');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json(user.exchangeKeys);
  } catch (error) {
    console.error('Error fetching exchange keys:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
