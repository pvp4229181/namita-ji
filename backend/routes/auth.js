const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail, sendOtpEmail } = require('../utils/mailer');
const { sendSms } = require('../utils/sms');
const { generateCode, hashCode, compareCode } = require('../utils/otp');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function isValidPhone(phone) {
  return /^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, '').slice(-10));
}

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
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, password and phone are required' });
    }
    if (!validator.isEmail(String(email))) return res.status(400).json({ error: 'Invalid email address' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });

    const pwProblem = passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({
      name: String(name).trim().slice(0, 80),
      email: String(email).toLowerCase(),
      phone: String(phone).trim().slice(0, 20)
    });
    await user.setPassword(password);
    await user.save();

    // Best-effort — a broken mail server shouldn't fail account creation. Awaited
    // (rather than fire-and-forget) because on serverless the process can be
    // frozen the instant the response is sent, before a background send finishes.
    try {
      await sendWelcomeEmail(user);
      user.welcomeEmail = { status: 'sent', sentAt: new Date() };
    } catch (err) {
      console.error('Welcome email error:', err.message);
      user.welcomeEmail = { status: 'failed', error: err.message };
    }

    // Account exists but is unusable (see /login) until both codes are confirmed.
    const emailCode = generateCode();
    const phoneCode = generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    user.verification = {
      email: { codeHash: await hashCode(emailCode), expiresAt, verified: false, attempts: 0 },
      phone: { codeHash: await hashCode(phoneCode), expiresAt, verified: false, attempts: 0 }
    };
    await user.save();

    try {
      await sendOtpEmail(user, emailCode);
    } catch (err) {
      console.error('OTP email error:', err.message);
    }
    try {
      await sendSms(user.phone, `Your Namita Ji verification code is ${phoneCode}. It expires in 10 minutes.`);
    } catch (err) {
      console.error('OTP SMS error:', err.message);
    }

    res.status(201).json({
      requiresVerification: true,
      userId: user._id,
      email: user.email,
      phone: user.phone,
      message: 'Enter the codes sent to your email and phone to activate your account.'
    });
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

    // `verification` is only present on accounts created after this feature
    // shipped — absent entirely (not false) on older accounts, which are
    // never gated retroactively.
    const v = user.verification;
    if (v && (!v.email?.verified || !v.phone?.verified)) {
      return res.status(403).json({
        error: 'Please verify your email and phone to activate your account',
        requiresVerification: true,
        userId: user._id,
        email: user.email,
        phone: user.phone
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

// Confirms the 4-digit codes sent to email and phone at signup and, once both
// match, issues the session token that /signup withheld.
router.post('/verify-signup', authLimiter, async (req, res) => {
  try {
    const { userId, emailCode, phoneCode } = req.body;
    if (!userId || !emailCode || !phoneCode) {
      return res.status(400).json({ error: 'Both codes are required' });
    }

    const user = await User.findById(userId);
    if (!user || !user.verification) return res.status(404).json({ error: 'Account not found' });

    const v = user.verification;
    if (v.email.verified && v.phone.verified) {
      return res.json({ success: true, token: signToken(user), user: user.toSafeJSON() });
    }

    const now = new Date();
    const checkChannel = async (channel, submittedCode) => {
      const c = v[channel];
      if (c.verified) return { ok: true };
      if (!c.codeHash || !c.expiresAt || c.expiresAt < now) {
        return { ok: false, error: `${channel} code has expired — request a new one` };
      }
      if (c.attempts >= MAX_OTP_ATTEMPTS) {
        return { ok: false, error: `Too many attempts — request a new ${channel} code` };
      }
      const match = await compareCode(String(submittedCode), c.codeHash);
      if (!match) {
        c.attempts += 1;
        return { ok: false, error: `${channel} code is incorrect` };
      }
      c.verified = true;
      return { ok: true };
    };

    const [emailResult, phoneResult] = await Promise.all([
      checkChannel('email', emailCode),
      checkChannel('phone', phoneCode)
    ]);

    if (!emailResult.ok || !phoneResult.ok) {
      await user.save();
      const errors = [emailResult.error, phoneResult.error].filter(Boolean);
      return res.status(400).json({ error: errors.join(' — ') });
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ success: true, token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    console.error('Verify signup error:', err);
    res.status(500).json({ error: 'Could not verify account' });
  }
});

// Re-sends a fresh code for one channel (email or phone) — used when the
// original expired, was lost, or a blocked login needs a new pair issued.
router.post('/resend-code', authLimiter, async (req, res) => {
  try {
    const { userId, channel } = req.body;
    if (!userId || !['email', 'phone'].includes(channel)) {
      return res.status(400).json({ error: 'A valid userId and channel are required' });
    }

    const user = await User.findById(userId);
    if (!user || !user.verification) return res.status(404).json({ error: 'Account not found' });
    if (user.verification[channel].verified) {
      return res.json({ success: true, alreadyVerified: true });
    }

    const code = generateCode();
    user.verification[channel] = {
      codeHash: await hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      verified: false,
      attempts: 0
    };
    await user.save();

    try {
      if (channel === 'email') {
        await sendOtpEmail(user, code);
      } else {
        await sendSms(user.phone, `Your Namita Ji verification code is ${code}. It expires in 10 minutes.`);
      }
    } catch (err) {
      console.error(`Resend ${channel} OTP error:`, err.message);
      return res.status(502).json({ error: `Could not send the ${channel} code right now — try again shortly` });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Resend code error:', err);
    res.status(500).json({ error: 'Could not resend code' });
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
