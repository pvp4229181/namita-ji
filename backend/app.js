require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const reviewRoutes = require('./routes/reviews');
const orderRoutes = require('./routes/orders');
const donationRoutes = require('./routes/donations');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

const app = express();

app.set('trust proxy', 1);

// Ensure a real DB connection exists before any request reaches a route —
// on serverless (Vercel), a cold start otherwise lets queries fire before
// Mongoose finishes connecting, and they buffer until they time out.
app.use((req, res, next) => {
  connectDB()
    .then(() => next())
    .catch((err) => res.status(503).json({ error: 'Database unavailable', detail: err.message }));
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com']
      }
    }
  })
);
app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Webhook needs the raw body for signature verification — must be mounted
// BEFORE express.json() touches the request.
app.use('/api/webhook/razorpay', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(mongoSanitize());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({ ok: true, db: states[mongoose.connection.readyState] || 'unknown', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/products', reviewRoutes);
app.use('/api/orders', orderRoutes);
// Donations are open to guests, but a signed-in donor gets the payment linked to
// their account — attachUser populates req.user when a token is present, never blocks.
app.use('/api/donations', attachUser, donationRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  // A request with a file extension is asking for a static asset. If express.static
  // didn't serve it, it doesn't exist — 404 rather than falling through to the
  // homepage, or a stale <script src> would receive HTML and fail to parse.
  if (path.extname(req.path)) return res.status(404).type('txt').send('Not found');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error handler — keeps stack traces out of responses in production.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message });
});

module.exports = app;
