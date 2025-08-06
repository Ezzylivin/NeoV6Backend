// Register a new user
router.post('/register', async (req, res) => {
  // 1. Only get email and password from the request body
  const { email, password } = req.body;

  // 2. Basic validation remains the same
  if (!email || !password) {
    return res.status(400).json({ message: 'Please enter all fields' });
  }

  try {
    const userExists = await user.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // 3. Fix the variable name and assign a default role
    const newUser = await user.create({
      email,
      password, // Bcrypt will hash this automatically via the model's 'pre-save' hook
      role: 'user' // Assign a default role securely on the server
    });

    // 4. Use the new variable to generate the token
    res.status(201).json({ access_token: token(newUser.id) });

  } catch (error) {
    // Add more specific logging for better debugging
    console.error("Registration failed:", error);
    res.status(500).json({ message: 'Server error' });
  }
});
