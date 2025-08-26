import * as userService from '../services/userService.js';

export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const createdUser = await userService.registerUser(username, email, password);
    return res.status(201).json(createdUser);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const loginUser = async (req, res) => {
  const identifier = req.body.email || req.body.username;
  const { password } = req.body;
  if (!identifier || !password) return res.status(400).json({ message: 'Provide email/username and password' });

  try {
    const loggedInUser = await userService.loginUser(identifier, password);
    return res.status(200).json(loggedInUser);
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export const getMe = (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  return res.status(200).json(req.user);
};
