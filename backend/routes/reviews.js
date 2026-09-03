const express = require('express');
const rateLimit = require('express-rate-limit');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// GET /api/products/:slug/reviews  — list + rating summary
router.get('/:slug/reviews', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const reviews = await Review.find({ product: product._id }).sort({ createdAt: -1 }).limit(200);
    const count = reviews.length;
    const average = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

    res.json({ reviews, count, average: Math.round(average * 10) / 10 });
  } catch (err) {
    console.error('List reviews error:', err);
    res.status(500).json({ error: 'Could not load reviews' });
  }
});

// POST /api/products/:slug/reviews  — one review per logged-in user per product
router.post('/:slug/reviews', requireAuth, writeLimiter, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const r = Number(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    if (!comment || !comment.trim()) return res.status(400).json({ error: 'Please write a short review' });

    const product = await Product.findOne({ slug: req.params.slug, isActive: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const existing = await Review.findOne({ product: product._id, user: req.user._id });
    if (existing) {
      existing.rating = r;
      existing.comment = comment.trim().slice(0, 1000);
      await existing.save();
      return res.json({ review: existing, updated: true });
    }

    const review = await Review.create({
      product: product._id,
      user: req.user._id,
      name: req.user.name,
      rating: r,
      comment: comment.trim().slice(0, 1000)
    });
    res.status(201).json({ review, updated: false });
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ error: 'Could not submit review' });
  }
});

module.exports = router;
