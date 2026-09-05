const express = require('express');
const Order = require('../models/Order');
const Donation = require('../models/Donation');
const User = require('../models/User');
const Product = require('../models/Product');
const PaymentLog = require('../models/PaymentLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getRazorpay } = require('../utils/razorpay');
const { restoreStock } = require('../utils/payments');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Totals are computed in MongoDB rather than by loading every paid order into
// memory — this stays fast once the store has real volume.
router.get('/summary', async (req, res) => {
  const paidOnly = { $match: { status: { $in: ['paid', 'refund_requested'] } } };
  const sum = { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } };

  const [orderCount, orderAgg, donationCount, donationAgg, userCount, pendingRefunds, refundedAgg] =
    await Promise.all([
      Order.countDocuments(),
      Order.aggregate([paidOnly, sum]),
      Donation.countDocuments(),
      Donation.aggregate([{ $match: { status: 'paid' } }, sum]),
      User.countDocuments({ role: 'customer' }),
      Order.countDocuments({ 'refund.status': 'requested' }),
      Order.aggregate([
        { $match: { 'refund.status': { $in: ['processed', 'partial'] } } },
        { $group: { _id: null, revenue: { $sum: { $ifNull: ['$refund.amount', '$amount'] } }, count: { $sum: 1 } } }
      ])
    ]);

  const orderRevenue = orderAgg[0]?.revenue || 0;
  const donationRevenue = donationAgg[0]?.revenue || 0;
  const refundedTotal = refundedAgg[0]?.revenue || 0;

  res.json({
    orderCount,
    paidOrderCount: orderAgg[0]?.count || 0,
    donationCount,
    paidDonationCount: donationAgg[0]?.count || 0,
    userCount,
    orderRevenue,
    donationRevenue,
    totalRevenue: orderRevenue + donationRevenue,
    refundedTotal,
    refundedCount: refundedAgg[0]?.count || 0,
    netRevenue: orderRevenue + donationRevenue - refundedTotal,
    pendingRefunds
  });
});

router.get('/orders', async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ razorpayOrderId: rx }, { razorpayPaymentId: rx }, { 'address.phone': rx }];
  }
  const orders = await Order.find(filter).populate('user', 'name email phone').sort({ createdAt: -1 }).limit(500);
  res.json({ orders });
});

router.get('/donations', async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const donations = await Donation.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).limit(500);
  res.json({ donations });
});

// Customers with what each has actually spent — this is the "who paid" view.
router.get('/users', async (req, res) => {
  const users = await User.find({ role: 'customer' }).select('-passwordHash').sort({ createdAt: -1 }).limit(1000);

  const spend = await Order.aggregate([
    { $match: { status: { $in: ['paid', 'refund_requested', 'refunded'] } } },
    {
      $group: {
        _id: '$user',
        totalSpent: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 0, '$amount'] } },
        orderCount: { $sum: 1 },
        lastOrderAt: { $max: '$paidAt' }
      }
    }
  ]);
  const spendMap = new Map(spend.map((s) => [String(s._id), s]));

  res.json({
    users: users.map((u) => {
      const s = spendMap.get(String(u._id));
      return {
        ...u.toObject(),
        totalSpent: s?.totalSpent || 0,
        orderCount: s?.orderCount || 0,
        lastOrderAt: s?.lastOrderAt || null
      };
    })
  });
});

router.get('/payment-logs', async (req, res) => {
  const filter = req.query.type ? { type: req.query.type } : {};
  const logs = await PaymentLog.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ logs });
});

// Process a refund via Razorpay for a paid order and record it.
// The `refunding` claim below is what stops a double-clicked "Refund" button (or two
// admins acting at once) from sending two refund calls for the same payment.
router.post('/orders/:id/refund', async (req, res) => {
  let claimed = null;
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.razorpayPaymentId) return res.status(400).json({ error: 'No captured payment on this order' });
    if (!['paid', 'refund_requested'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot refund an order in "${order.status}" state` });
    }
    if (order.refund && ['processed', 'partial'].includes(order.refund.status)) {
      return res.status(400).json({ error: 'This payment has already been refunded' });
    }

    // Full refund by default; an explicit smaller amount is allowed for partials.
    const requested = req.body.amount === undefined ? order.amount : Number(req.body.amount);
    if (!Number.isFinite(requested) || requested <= 0 || requested > order.amount) {
      return res.status(400).json({ error: `Refund amount must be between ₹1 and ₹${order.amount}` });
    }
    const isFull = Math.round(requested * 100) === Math.round(order.amount * 100);

    // Atomically claim the refund so a concurrent request can't also fire one.
    claimed = await Order.findOneAndUpdate(
      { _id: order._id, 'refund.status': { $nin: ['processing', 'processed', 'partial'] } },
      { $set: { 'refund.status': 'processing' } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ error: 'A refund is already being processed for this order' });

    const razorpay = getRazorpay();
    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: Math.round(requested * 100),
      speed: 'normal',
      notes: { orderId: String(order._id), byAdmin: String(req.user._id) }
    });

    const updated = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          ...(isFull ? { status: 'refunded' } : {}),
          'refund.status': isFull ? 'processed' : 'partial',
          'refund.amount': requested,
          'refund.razorpayRefundId': refund.id,
          'refund.processedAt': new Date(),
          'refund.adminNote': String(req.body.note || '').slice(0, 500)
        }
      },
      { new: true }
    );

    // Money went back, so the goods come back into stock.
    if (isFull) await restoreStock(updated);

    await PaymentLog.create({
      type: 'refund_processed',
      refModel: 'Order',
      refId: order._id,
      user: order.user,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      amount: requested,
      ip: req.ip,
      meta: { razorpayRefundId: refund.id, byAdmin: String(req.user._id), partial: !isFull }
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Refund error:', err);
    // Release the claim so the admin can retry after fixing whatever failed.
    if (claimed) {
      await Order.updateOne(
        { _id: req.params.id, 'refund.status': 'processing' },
        { $set: { 'refund.status': claimed.status === 'refund_requested' ? 'requested' : 'none' } }
      ).catch(() => {});
    }
    await PaymentLog.create({
      type: 'refund_failed',
      refModel: 'Order',
      refId: req.params.id,
      ip: req.ip,
      meta: { error: err.error?.description || err.message, byAdmin: String(req.user?._id) }
    }).catch(() => {});
    res.status(500).json({ error: err.error?.description || 'Refund failed. Check the Razorpay dashboard for details.' });
  }
});

router.post('/orders/:id/reject-refund', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'refund_requested') {
    return res.status(400).json({ error: 'No open refund request on this order' });
  }
  const note = String(req.body.note || '').slice(0, 500);
  const updated = await Order.findByIdAndUpdate(
    order._id,
    { $set: { status: 'paid', 'refund.status': 'rejected', 'refund.adminNote': note } },
    { new: true }
  );
  await PaymentLog.create({
    type: 'refund_rejected',
    refModel: 'Order',
    refId: order._id,
    user: order.user,
    razorpayPaymentId: order.razorpayPaymentId,
    amount: order.amount,
    ip: req.ip,
    meta: { note, byAdmin: String(req.user._id) }
  });
  res.json({ success: true, order: updated });
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
