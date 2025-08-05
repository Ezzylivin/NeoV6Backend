const User = require('../models/User'); // The Mongoose User model
const bcrypt = require('bcryptjs');     // Library to hash passwords

/**
 * @desc    Register a new user in the database
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.registerUser = async (req, res) => {
  // 1. Destructure email and password from the request body sent by the frontend
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide an email and password' });
  }

  try {
    // 2. Check if a user with this email already exists in the database
    let user = await User.findOne({ email });

    if (user) {
      // If the user exists, send a 400 Bad Request error
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // 3. If user does not exist, create a new user instance
    user = new User({
      email,
      password,
      // You can set a default role here if your schema has one
    });

    // 4. Hash the password for security before saving it
    const salt = await bcrypt.genSalt(10); // Generate a salt
    user.password = await bcrypt.hash(password, salt); // Hash the password with the salt

    // 5. Save the new user document to the MongoDB database
    await user.save();

    // 6. Send a success response
    // IMPORTANT: You do NOT send the password back, not even the hash.
    res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    // If any other server error occurs, log it and send a generic 500 error
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};
