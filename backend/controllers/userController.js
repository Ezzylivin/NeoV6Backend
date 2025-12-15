// File: backend/controllers/userController.js

import { 
    registerUser as registerSvc, 
    loginUser as loginSvc, 
    getMe as getMeSvc,
    updateUserApiKeys as updateKeysSvc,
    getUserApiKeys as getKeysSvc,      // 👈 New Import
    deleteUserApiKey as deleteKeySvc   // 👈 New Import
} from "../services/userService.js";

/**
 * Handles user registration request.
 * POST /api/users/register
 */
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const { token, ...userData } = await registerSvc(username, email, password);
    res.status(201).json({ token, user: userData });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Handles user login request.
 * POST /api/users/login
 */
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Identifier and password are required" });
    }

    const { token, ...userData } = await loginSvc(identifier, password);
    res.status(200).json({ token, user: userData });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
};

/**
 * Handles request to get the current authenticated user's profile.
 * GET /api/users/me
 */
export const getMe = async (req, res) => {
  try {
    const user = await getMeSvc(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

/**
 * Handles request to update or add API keys for the current user.
 * POST /api/users/keys
 */
export const updateApiKeys = async (req, res) => {
    try {
        const userId = req.user.id;
        const { exchange, apiKey, apiSecret } = req.body;

        if (!exchange || !apiKey || !apiSecret) {
            return res.status(400).json({ message: 'Exchange, apiKey, and apiSecret are required' });
        }
        
        const updatedKeys = await updateKeysSvc(userId, exchange, apiKey, apiSecret);
        res.status(200).json({ message: 'API keys updated successfully', keys: updatedKeys });
    } catch (err) {
        console.error('[UserController] UpdateKeys error:', err.message);
        res.status(500).json({ message: "Failed to update API keys", error: err.message });
    }
};

/**
 * Handles request to fetch masked API keys.
 * GET /api/users/keys
 */
export const getApiKeys = async (req, res) => {
    try {
        const keys = await getKeysSvc(req.user.id);
        res.status(200).json(keys);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch keys", error: err.message });
    }
};

/**
 * Handles request to delete a specific exchange key.
 * DELETE /api/users/keys/:exchange
 */
export const deleteApiKey = async (req, res) => {
    try {
        const { exchange } = req.params;
        await deleteKeySvc(req.user.id, exchange);
        res.status(200).json({ message: `Key for ${exchange} deleted` });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete key", error: err.message });
    }
};
