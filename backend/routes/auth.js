const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

// A real bcrypt hash to compare against when the email doesn't exist, so a wrong
// email and a wrong password take the same time and can't be told apart.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Password must contain both letters and numbers';
  if (p.length > 200) return 'Password is too long';
  return null;
}

router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!validator.isEmail(String(email))) return res.status(400).json({ error: 'Invalid email address' });

    const pwProblem = passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({
      name: String(name).trim().slice(0, 80),
      email: String(email).toLowerCase(),
      phone: phone ? String(phone).trim().slice(0, 20) : undefined
    });
    await user.setPassword(password);
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    // A racing duplicate signup hits the unique index rather than the check above.
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    const match = user
      ? await user.comparePassword(String(password))
      : await bcrypt.compare(String(password), DUMMY_HASH);

    if (!user || !match) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.isActive) return res.status(403).json({ error: 'This account has been disabled' });

    user.lastLoginAt = new Date();
    await user.save();

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

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      req.user.name = String(name).trim().slice(0, 80);
    }
    if (phone !== undefined) req.user.phone = String(phone).trim().slice(0, 20);
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

router.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const ok = await req.user.comparePassword(String(currentPassword));
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) return res.status(400).json({ error: pwProblem });

    await req.user.setPassword(String(newPassword));
    await req.user.save();

    // Every existing session is now invalid — hand back a fresh token for this device.
    res.json({ token: signToken(req.user), user: req.user.toSafeJSON() });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Could not change password' });
  }
});

router.post('/address', requireAuth, async (req, res) => {
  try {
    const { label, line1, line2, city, state, pincode, phone } = req.body;
    if (!line1 || !city || !state || !pincode || !phone) {
      return res.status(400).json({ error: 'Address line1, city, state, pincode and phone are required' });
    }
    if (!/^\d{6}$/.test(String(pincode).trim())) {
      return res.status(400).json({ error: 'Enter a valid 6-digit pincode' });
    }
    if (req.user.addresses.length >= 10) {
      return res.status(400).json({ error: 'You can save up to 10 addresses' });
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
