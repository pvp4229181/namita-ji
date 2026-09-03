const express = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const Donation = require('../models/Donation');
const PaymentLog = require('../models/PaymentLog');
const { getRazorpay, verifyPaymentSignature } = require('../utils/razorpay');

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please slow down.' }
});

router.post('/create', paymentLimiter, async (req, res) => {
  try {
    const { name, email, phone, amount, message, userId } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (!validator.isEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    const amt = Math.round(Number(amount));
    if (!amt || amt < 1) return res.status(400).json({ error: 'Enter a valid donation amount' });
    if (amt > 500000) return res.status(400).json({ error: 'Amount too large for a single donation' });

    const razorpay = getRazorpay();
    const rpOrder = await razorpay.orders.create({
      amount: amt * 100,
      currency: 'INR',
      receipt: `donation_rcpt_${Date.now()}`
    });

    const donation = await Donation.create({
      user: userId || undefined,
      name,
      email: email.toLowerCase(),
      phone,
      amount: amt,
      message: message || '',
      razorpayOrderId: rpOrder.id,
      status: 'created'
    });

    await PaymentLog.create({
      type: 'donation_order_created',
      refModel: 'Donation',
      refId: donation._id,
      razorpayOrderId: rpOrder.id,
      amount: amt,
      ip: req.ip
    });

    res.status(201).json({
      donationId: donation._id,
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Create donation error:', err);
    res.status(500).json({ error: 'Could not start donation' });
  }
});

router.post('/verify', paymentLimiter, async (req, res) => {
  try {
    const { donationId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!donationId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ error: 'Donation not found' });
    if (donation.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order mismatch' });
    }

    const valid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!valid) {
      donation.status = 'failed';
      await donation.save();
      await PaymentLog.create({
        type: 'verify_failure',
        refModel: 'Donation',
        refId: donation._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        ip: req.ip
      });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    donation.status = 'paid';
    donation.razorpayPaymentId = razorpay_payment_id;
    donation.razorpaySignature = razorpay_signature;
    donation.paidAt = new Date();
    await donation.save();

    await PaymentLog.create({
      type: 'verify_success',
      refModel: 'Donation',
      refId: donation._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: donation.amount,
      ip: req.ip
    });

    res.json({ success: true, donation });
  } catch (err) {
    console.error('Verify donation error:', err);
    res.status(500).json({ error: 'Could not verify donation' });
  }
});

module.exports = router;
