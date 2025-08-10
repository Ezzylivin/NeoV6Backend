// File: backend/services/registerService.js
import bcrypt from "bcryptjs";
import User from "../dbStructure/user.js";
import token from "../utils/token.js";

export const registerUser = async (username, email, password) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User already exists");
  }

  // Hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create the user
  const newUser = await User.create({
    username,
    email,
    password: hashedPassword,
  });

  // Generate JWT including both id and username
  const jwtToken = token({
    _id: newUser._id,
    username: newUser.username,
  });

  return {
    token: token(newUser._id),
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
  };
};
