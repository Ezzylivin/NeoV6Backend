import * as userService from "../services/userService.js";

// Controller for Register
export const registerUser = async (req, res) => {
  console.log("REQ.BODY:", req.body);
  const { username, email, password } = req.body;

  try {
    const createdUser = await userService.registerUser(username, email, password);

    // createdUser already contains { _id, username, email, token }
    return res.status(201).json(createdUser);
  } catch (error) {
    // Could be a validation or duplicate error
    return res.status(400).json({ message: error.message });
  }
};

// Controller for Login
export const loginUser = async (req, res) => {
  // Allow clients to send either { email, password } or { username, password }.
  // We accept `identifier` as either req.body.email || req.body.username
  const identifier = req.body.email || req.body.username;
  const { password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "Please provide email or username and password" });
  }

  try {
    const loggedInUser = await userService.loginUser(identifier, password);

    // loggedInUser contains { _id, username, email, token }
    return res.status(200).json(loggedInUser);
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

// Controller for Get Me
export const getMe = (req, res) => {
  // Assumes `protect` middleware attaches `req.user` (sanitized)
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  return res.status(200).json(req.user);
};
