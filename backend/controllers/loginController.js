import user from '../dbStructure/user.js'; /


// @desc    Login user
// @route   POST /api/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await user.findOne({ email });
    if (user && await user.comparePassword(password))) {
      return res.status(200).json({ message: 'valid email & password' });
    }

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[Login Error]', error);
    res.status(500).json({ message: 'Server error' });
  }
};
