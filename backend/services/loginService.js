// Login existing user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await user.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({ access_token: token(user.id) });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
