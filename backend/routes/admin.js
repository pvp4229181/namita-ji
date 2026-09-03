const express = require('express');
const Order = require('../models/Order');
const Donation = require('../models/Donation');
const User = require('../models/User');
const Product = require('../models/Product');
const PaymentLog = require('../models/PaymentLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getRazorpay } = require('../utils/razorpay');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/summary', async (req, res) => {
  const [orderCount, paidOrders, donationCount, paidDonations, userCount] = await Promise.all([
    Order.countDocuments(),
    Order.find({ status: 'paid' }),
    Donation.countDocuments(),
    Donation.find({ status: 'paid' }),
    User.countDocuments({ role: 'customer' })
  ]);
  const orderRevenue = paidOrders.reduce((s, o) => s + o.amount, 0);
  const donationRevenue = paidDonations.reduce((s, d) => s + d.amount, 0);
  const pendingRefunds = await Order.countDocuments({ 'refund.status': 'requested' });

  res.json({
    orderCount,
    donationCount,
    userCount,
    orderRevenue,
    donationRevenue,
    totalRevenue: orderRevenue + donationRevenue,
    pendingRefunds
  });
});

router.get('/orders', async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).limit(500);
  res.json({ orders });
});

router.get('/donations', async (req, res) => {
  const donations = await Donation.find().sort({ createdAt: -1 }).limit(500);
  res.json({ donations });
});

router.get('/users', async (req, res) => {
  const users = await User.find({ role: 'customer' }).select('-passwordHash').sort({ createdAt: -1 });
  res.json({ users });
});

router.get('/payment-logs', async (req, res) => {
  const logs = await PaymentLog.find().sort({ createdAt: -1 }).limit(500);
  res.json({ logs });
});

// Process a refund via Razorpay for a paid order and record it.
router.post('/orders/:id/refund', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.razorpayPaymentId) return res.status(400).json({ error: 'No captured payment on this order' });
    if (order.refund && order.refund.status === 'processed') {
      return res.status(400).json({ error: 'Already refunded' });
    }

    const razorpay = getRazorpay();
    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: Math.round(order.amount * 100)
    });

    order.status = 'refunded';
    order.refund = {
      ...order.refund,
      status: 'processed',
      razorpayRefundId: refund.id,
      processedAt: new Date(),
      adminNote: req.body.note || ''
    };
    await order.save();

    await PaymentLog.create({
      type: 'refund_processed',
      refModel: 'Order',
      refId: order._id,
      user: order.user,
      razorpayPaymentId: order.razorpayPaymentId,
      amount: order.amount,
      ip: req.ip,
      meta: { razorpayRefundId: refund.id, byAdmin: req.user._id }
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error('Refund error:', err);
    await PaymentLog.create({ type: 'refund_failed', refModel: 'Order', refId: req.params.id, ip: req.ip, meta: { error: err.message } });
    res.status(500).json({ error: 'Refund failed. Check Razorpay dashboard for details.' });
  }
});

router.post('/orders/:id/reject-refund', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = 'paid';
  order.refund = { ...order.refund, status: 'rejected', adminNote: req.body.note || '' };
  await order.save();
  res.json({ success: true, order });
});

// --- Product management ---
router.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
});

router.delete('/products/:id', async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true });
});

module.exports = router;
