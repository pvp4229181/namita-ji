const express = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const Donation = require('../models/Donation');
const PaymentLog = require('../models/PaymentLog');
const { getRazorpay, verifyPaymentSignature } = require('../utils/razorpay');
const { toPaise, assertPaymentMatchesRecord, markDonationPaid, markFailedIfPending } = require('../utils/payments');

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please slow down.' }
});

const MIN_DONATION = 10;
const MAX_DONATION = 500000;

router.post('/create', paymentLimiter, async (req, res) => {
  try {
    const { name, email, phone, amount, message } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (!validator.isEmail(String(email))) return res.status(400).json({ error: 'Invalid email address' });

    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt < MIN_DONATION) {
      return res.status(400).json({ error: `Minimum donation is ₹${MIN_DONATION}` });
    }
    if (amt > MAX_DONATION) return res.status(400).json({ error: 'Amount too large for a single donation' });

    const razorpay = getRazorpay();
    const rpOrder = await razorpay.orders.create({
      amount: toPaise(amt),
      currency: 'INR',
      receipt: `dntn_${Date.now()}`,
      notes: { kind: 'donation', email: String(email).toLowerCase() }
    });

    const donation = await Donation.create({
      // Never trusted from the body — a donation is linked to an account only when a
      // valid session proves who is donating (see attachUser below).
      user: req.user?._id,
      name: String(name).slice(0, 120),
      email: String(email).toLowerCase(),
      phone: phone ? String(phone).slice(0, 20) : undefined,
      amount: amt,
      message: String(message || '').slice(0, 500),
      razorpayOrderId: rpOrder.id,
      status: 'created'
    });

    await PaymentLog.create({
      type: 'donation_order_created',
      refModel: 'Donation',
      refId: donation._id,
      user: req.user?._id,
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

// Donation history for the signed-in donor.
router.get('/my', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const donations = await Donation.find({ user: req.user._id, status: 'paid' })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ donations });
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
    if (donation.status === 'paid') {
      return res.json({ success: true, donation, alreadyRecorded: true });
    }

    if (!verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    })) {
      await markFailedIfPending(Donation, donation._id);
      await PaymentLog.create({
        type: 'verify_failure',
        refModel: 'Donation',
        refId: donation._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        ip: req.ip,
        meta: { reason: 'signature_mismatch' }
      });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    let payment;
    try {
      payment = await assertPaymentMatchesRecord(razorpay_payment_id, {
        razorpayOrderId: donation.razorpayOrderId,
        amountInRupees: donation.amount
      });
    } catch (err) {
      await PaymentLog.create({
        type: err.code === 'MISMATCH' ? 'amount_mismatch' : 'verify_failure',
        refModel: 'Donation',
        refId: donation._id,
        razorpayOrderId: donation.razorpayOrderId,
        razorpayPaymentId: razorpay_payment_id,
        amount: donation.amount,
        ip: req.ip,
        meta: { reason: err.message, razorpayStatus: err.payment?.status, razorpayAmount: err.payment?.amount }
      });
      if (err.code === 'FETCH_FAILED') {
        return res.status(202).json({
          success: false,
          pending: true,
          error: 'We could not confirm your donation right now. If money was debited it will be confirmed automatically within a few minutes.'
        });
      }
      await markFailedIfPending(Donation, donation._id);
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const { donation: paid } = await markDonationPaid(donation._id, {
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      payment,
      source: 'checkout_callback',
      ip: req.ip
    });

    res.json({ success: true, donation: paid });
  } catch (err) {
    console.error('Verify donation error:', err);
    res.status(500).json({ error: 'Could not verify donation' });
  }
});

module.exports = router;
