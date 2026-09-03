const express = require('express');
const Order = require('../models/Order');
const Donation = require('../models/Donation');
const Product = require('../models/Product');
const PaymentLog = require('../models/PaymentLog');
const { verifyWebhookSignature } = require('../utils/razorpay');

const router = express.Router();

// Razorpay webhook — the authoritative, server-to-server confirmation of payment
// status. This is the real safety net in case the client never calls /verify
// (closed tab, network drop, tampering attempt). Requires RAZORPAY_WEBHOOK_SECRET
// to be set and configured in the Razorpay dashboard against this endpoint.
// Mounted with express.raw() in server.js so req.body is the raw buffer here.
router.post('/', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
    return res.status(500).send('Webhook not configured');
  }
  if (!signature || !verifyWebhookSignature(req.body, signature, secret)) {
    await PaymentLog.create({ type: 'webhook_signature_invalid', ip: req.ip });
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (e) {
    return res.status(400).send('Bad payload');
  }

  await PaymentLog.create({ type: 'webhook_received', meta: { event: payload.event }, ip: req.ip });

  try {
    if (payload.event === 'payment.captured') {
      const payment = payload.payload.payment.entity;
      const rpOrderId = payment.order_id;

      const order = await Order.findOne({ razorpayOrderId: rpOrderId });
      if (order && order.status !== 'paid') {
        order.status = 'paid';
        order.razorpayPaymentId = payment.id;
        order.paidAt = new Date();
        await order.save();
        for (const item of order.items) {
          await Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } });
        }
      }

      const donation = await Donation.findOne({ razorpayOrderId: rpOrderId });
      if (donation && donation.status !== 'paid') {
        donation.status = 'paid';
        donation.razorpayPaymentId = payment.id;
        donation.paidAt = new Date();
        await donation.save();
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.status(200).send('ok');
});

module.exports = router;
