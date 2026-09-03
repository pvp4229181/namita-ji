const express = require('express');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slow brute-force login/signup attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!validator.isEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ name: name.trim(), email: email.toLowerCase(), phone });
    await user.setPassword(password);
    await user.save();

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.isActive) return res.status(403).json({ error: 'This account has been disabled' });

    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

router.post('/address', requireAuth, async (req, res) => {
  try {
    const { label, line1, line2, city, state, pincode, phone } = req.body;
    if (!line1 || !city || !state || !pincode || !phone) {
      return res.status(400).json({ error: 'Address line1, city, state, pincode and phone are required' });
    }
    req.user.addresses.push({ label, line1, line2, city, state, pincode, phone });
    await req.user.save();
    res.status(201).json({ user: req.user.toSafeJSON() });
  } catch (err) {
    console.error('Add address error:', err);
    res.status(500).json({ error: 'Could not save address' });
  }
});

router.delete('/address/:addressId', requireAuth, async (req, res) => {
  req.user.addresses = req.user.addresses.filter((a) => String(a._id) !== req.params.addressId);
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
