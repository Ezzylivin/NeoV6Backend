// File: backend/services/registerService.js (Corrected)

import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import token from "../utils/token.js"; // Assuming token.js has a NAMED export

export const registerUser = async (username, email, password) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User with that email already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newUser = await User.create({
    username,
    email,
    password: hashedPassword,
  });

  // Generate a token for the new user
  const token = generateToken(newUser._id);

  // Return the new user object and the token
  return {
    token: jwtToken,
    user: {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
    }
  };
};
