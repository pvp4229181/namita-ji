const express = require('express');
const rateLimit = require('express-rate-limit');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PaymentLog = require('../models/PaymentLog');
const { requireAuth } = require('../middleware/auth');
const { getRazorpay, verifyPaymentSignature } = require('../utils/razorpay');

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please slow down.' }
});

const SHIPPING_FLAT_FEE = 49;
const FREE_SHIPPING_THRESHOLD = 499;

// Create a Razorpay order for the cart. Prices are re-read from the DB —
// the client only sends product ids and quantities, never amounts. This is
// what stops someone from tampering with prices in the browser.
router.post('/create', requireAuth, paymentLimiter, async (req, res) => {
  try {
    const { items, address } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!address || !address.line1 || !address.city || !address.state || !address.pincode || !address.phone) {
      return res.status(400).json({ error: 'A complete delivery address is required' });
    }

    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, isActive: true });
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let itemsTotal = 0;
    for (const i of items) {
      const p = productMap.get(String(i.productId));
      const qty = Math.max(1, parseInt(i.quantity, 10) || 1);
      if (!p) return res.status(400).json({ error: 'One or more items are no longer available' });
      if (p.stock < qty) return res.status(400).json({ error: `${p.name} is out of stock` });
      orderItems.push({ product: p._id, name: p.name, price: p.price, quantity: qty, image: p.image });
      itemsTotal += p.price * qty;
    }

    const shipping = itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_FEE;
    const amount = itemsTotal + shipping;

    const razorpay = getRazorpay();
    const rpOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `order_rcpt_${Date.now()}`
    });

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      itemsTotal,
      shipping,
      amount,
      address,
      razorpayOrderId: rpOrder.id,
      status: 'created'
    });

    await PaymentLog.create({
      type: 'order_created',
      refModel: 'Order',
      refId: order._id,
      user: req.user._id,
      razorpayOrderId: rpOrder.id,
      amount,
      ip: req.ip
    });

    res.status(201).json({
      orderId: order._id,
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

// Verify payment signature after Razorpay Checkout succeeds client-side.
// Nothing is trusted from the client except these three ids — signature math decides truth.
router.post('/verify', requireAuth, paymentLimiter, async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order mismatch' });
    }

    const valid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!valid) {
      order.status = 'failed';
      await order.save();
      await PaymentLog.create({
        type: 'verify_failure',
        refModel: 'Order',
        refId: order._id,
        user: req.user._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        ip: req.ip
      });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    order.status = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    await order.save();

    // Decrement stock now that payment is confirmed.
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } });
    }

    await PaymentLog.create({
      type: 'verify_success',
      refModel: 'Order',
      refId: order._id,
      user: req.user._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: order.amount,
      ip: req.ip
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error('Verify order error:', err);
    res.status(500).json({ error: 'Could not verify payment' });
  }
});

router.get('/my', requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ orders });
});

router.post('/:id/refund-request', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be refunded' });

    order.status = 'refund_requested';
    order.refund = {
      ...order.refund,
      requestedAt: new Date(),
      reason: reason || '',
      status: 'requested'
    };
    await order.save();

    await PaymentLog.create({
      type: 'refund_requested',
      refModel: 'Order',
      refId: order._id,
      user: req.user._id,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      amount: order.amount,
      ip: req.ip,
      meta: { reason }
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error('Refund request error:', err);
    res.status(500).json({ error: 'Could not submit refund request' });
  }
});

module.exports = router;
