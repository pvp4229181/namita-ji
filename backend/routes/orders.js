const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PaymentLog = require('../models/PaymentLog');
const { requireAuth } = require('../middleware/auth');
const { getRazorpay, verifyPaymentSignature } = require('../utils/razorpay');
const {
  toPaise,
  assertPaymentMatchesRecord,
  markOrderPaid,
  markFailedIfPending
} = require('../utils/payments');

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
const MAX_QTY_PER_ITEM = 50;

// Create a Razorpay order for the cart. Prices are re-read from the DB —
// the client only sends product ids and quantities, never amounts. This is
// what stops someone from tampering with prices in the browser.
router.post('/create', requireAuth, paymentLimiter, async (req, res) => {
  try {
    const { items, address } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Too many line items in one order' });
    }
    if (!address || !address.line1 || !address.city || !address.state || !address.pincode || !address.phone) {
      return res.status(400).json({ error: 'A complete delivery address is required' });
    }
    if (!/^\d{6}$/.test(String(address.pincode).trim())) {
      return res.status(400).json({ error: 'Enter a valid 6-digit pincode' });
    }
    if (!/^[6-9]\d{9}$/.test(String(address.phone).replace(/\D/g, '').slice(-10))) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    }

    // Collapse duplicate lines for the same product so quantity limits can't be
    // bypassed by sending the same id twice.
    const merged = new Map();
    for (const i of items) {
      const id = String(i.productId || '');
      const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(i.quantity, 10) || 1));
      merged.set(id, Math.min(MAX_QTY_PER_ITEM, (merged.get(id) || 0) + qty));
    }

    for (const id of merged.keys()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'One or more items are no longer available' });
      }
    }

    const products = await Product.find({ _id: { $in: [...merged.keys()] }, isActive: true });
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let itemsTotal = 0;
    for (const [productId, qty] of merged) {
      const p = productMap.get(productId);
      if (!p) return res.status(400).json({ error: 'One or more items are no longer available' });
      if (p.stock < qty) return res.status(400).json({ error: `${p.name} — only ${p.stock} left in stock` });
      orderItems.push({ product: p._id, name: p.name, price: p.price, quantity: qty, image: p.image });
      itemsTotal += p.price * qty;
    }

    const shipping = itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_FEE;
    const amount = itemsTotal + shipping;
    if (!(amount > 0)) return res.status(400).json({ error: 'Invalid order total' });

    const razorpay = getRazorpay();
    const rpOrder = await razorpay.orders.create({
      amount: toPaise(amount),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${String(req.user._id).slice(-6)}`,
      notes: { userId: String(req.user._id), email: req.user.email }
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

// Verify payment after Razorpay Checkout succeeds in the browser.
// Three independent gates must pass before an order is marked paid:
//   1. the order belongs to the logged-in user and matches the razorpay order id,
//   2. the HMAC signature verifies against our key secret,
//   3. Razorpay's own API confirms the payment is for this order, in INR, for the
//      exact amount we computed, and is captured.
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

    // Idempotency: a retry, a double submit, or the webhook having landed first
    // must all return the same success, never re-run the side effects.
    if (order.status === 'paid') {
      return res.json({ success: true, order, alreadyRecorded: true });
    }
    if (['refund_requested', 'refunded'].includes(order.status)) {
      return res.json({ success: true, order, alreadyRecorded: true });
    }

    if (!verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    })) {
      await markFailedIfPending(Order, order._id);
      await PaymentLog.create({
        type: 'verify_failure',
        refModel: 'Order',
        refId: order._id,
        user: req.user._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        ip: req.ip,
        meta: { reason: 'signature_mismatch' }
      });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Signature is genuine — now confirm what was actually charged.
    let payment;
    try {
      payment = await assertPaymentMatchesRecord(razorpay_payment_id, {
        razorpayOrderId: order.razorpayOrderId,
        amountInRupees: order.amount
      });
    } catch (err) {
      await PaymentLog.create({
        type: err.code === 'MISMATCH' ? 'amount_mismatch' : 'verify_failure',
        refModel: 'Order',
        refId: order._id,
        user: req.user._id,
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: razorpay_payment_id,
        amount: order.amount,
        ip: req.ip,
        meta: { reason: err.message, razorpayStatus: err.payment?.status, razorpayAmount: err.payment?.amount }
      });

      // A fetch failure is our problem, not the customer's: the money may well have
      // been taken, so leave the order pending and let the webhook settle it.
      if (err.code === 'FETCH_FAILED') {
        return res.status(202).json({
          success: false,
          pending: true,
          error: 'We could not confirm your payment right now. If money was debited it will be confirmed automatically within a few minutes.'
        });
      }
      await markFailedIfPending(Order, order._id);
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const { order: paidOrder } = await markOrderPaid(order._id, {
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      payment,
      source: 'checkout_callback',
      ip: req.ip
    });

    res.json({ success: true, order: paidOrder });
  } catch (err) {
    console.error('Verify order error:', err);
    res.status(500).json({ error: 'Could not verify payment' });
  }
});

router.get('/my', requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(200);
  res.json({ orders });
});

router.get('/:id', requireAuth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

const REFUND_WINDOW_DAYS = 7;

router.post('/:id/refund-request', requireAuth, async (req, res) => {
  try {
    const reason = String(req.body.reason || '').slice(0, 500);
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'refund_requested') {
      return res.status(400).json({ error: 'A refund request is already open for this order' });
    }
    if (order.status === 'refunded') return res.status(400).json({ error: 'This order has already been refunded' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be refunded' });

    const ageDays = (Date.now() - new Date(order.paidAt || order.createdAt).getTime()) / 86400000;
    if (ageDays > REFUND_WINDOW_DAYS) {
      return res.status(400).json({ error: `Refunds can only be requested within ${REFUND_WINDOW_DAYS} days of payment` });
    }

    order.status = 'refund_requested';
    order.refund = {
      ...(order.refund ? order.refund.toObject?.() || order.refund : {}),
      requestedAt: new Date(),
      reason,
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
