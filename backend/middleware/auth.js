const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function resolveUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(payload.id);
  if (!user || !user.isActive) return null;

  // Tokens issued before the last password change are refused, so "log out
  // everywhere" actually works after a password reset.
  if (user.passwordChangedAt && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000) {
    return null;
  }
  return user;
}

async function requireAuth(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Optional auth: populates req.user when a valid token is present, but never blocks.
// Used for donations, which guests are allowed to make while signed-in donors still
// get the payment tied to their account.
async function attachUser(req, res, next) {
  try {
    req.user = (await resolveUser(req)) || undefined;
  } catch (err) {
    req.user = undefined;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, attachUser };
