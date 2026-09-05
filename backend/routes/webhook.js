const express = require('express');
const Order = require('../models/Order');
const Donation = require('../models/Donation');
const PaymentLog = require('../models/PaymentLog');
const { verifyWebhookSignature } = require('../utils/razorpay');
const {
  checkPaymentMatches,
  toPaise,
  markOrderPaid,
  markDonationPaid,
  markFailedIfPending,
  restoreStock
} = require('../utils/payments');

const router = express.Router();

// Razorpay webhook — the authoritative, server-to-server confirmation of payment
// status, and the reason a payment is still recorded when the customer closes the
// tab mid-checkout. Mounted with express.raw() in app.js so req.body is the raw
// buffer the signature was computed over.
//
// Every branch is idempotent: Razorpay retries a webhook until it gets a 2xx, and
// the same event will legitimately arrive more than once.
router.post('/', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
    return res.status(500).send('Webhook not configured');
  }
  if (!signature || !verifyWebhookSignature(req.body, signature, secret)) {
    await PaymentLog.create({ type: 'webhook_signature_invalid', ip: req.ip }).catch(() => {});
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (e) {
    return res.status(400).send('Bad payload');
  }

  const event = payload.event;
  const eventId = req.headers['x-razorpay-event-id'];

  // Always acknowledge quickly. Razorpay retries on non-2xx, and a retry storm on a
  // transient DB error is worse than processing the same event again later.
  res.status(200).send('ok');

  try {
    await PaymentLog.create({ type: 'webhook_received', ip: req.ip, meta: { event, eventId } });

    if (event === 'payment.captured' || event === 'payment.authorized') {
      await handlePaymentSuccess(payload.payload.payment.entity, req.ip);
    } else if (event === 'payment.failed') {
      await handlePaymentFailed(payload.payload.payment.entity, req.ip);
    } else if (event === 'refund.processed' || event === 'refund.created') {
      await handleRefund(payload.payload.refund.entity, req.ip);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    await PaymentLog.create({
      type: 'webhook_error',
      ip: req.ip,
      meta: { event, eventId, error: err.message }
    }).catch(() => {});
  }
});

async function handlePaymentSuccess(payment, ip) {
  const rpOrderId = payment.order_id;

  const order = await Order.findOne({ razorpayOrderId: rpOrderId });
  if (order) {
    // Same amount/currency/status check the browser path runs — the webhook body is
    // signed, so the entity can be trusted directly without a second API fetch.
    const problem = checkPaymentMatches(payment, {
      razorpayOrderId: order.razorpayOrderId,
      amountInPaise: toPaise(order.amount)
    });
    if (problem) {
      await PaymentLog.create({
        type: 'amount_mismatch',
        refModel: 'Order',
        refId: order._id,
        user: order.user,
        razorpayOrderId: rpOrderId,
        razorpayPaymentId: payment.id,
        amount: order.amount,
        ip,
        meta: { reason: problem, source: 'webhook' }
      });
      return;
    }
    await markOrderPaid(order._id, {
      paymentId: payment.id,
      payment,
      source: 'webhook',
      ip
    });
    return;
  }

  const donation = await Donation.findOne({ razorpayOrderId: rpOrderId });
  if (donation) {
    const problem = checkPaymentMatches(payment, {
      razorpayOrderId: donation.razorpayOrderId,
      amountInPaise: toPaise(donation.amount)
    });
    if (problem) {
      await PaymentLog.create({
        type: 'amount_mismatch',
        refModel: 'Donation',
        refId: donation._id,
        razorpayOrderId: rpOrderId,
        razorpayPaymentId: payment.id,
        amount: donation.amount,
        ip,
        meta: { reason: problem, source: 'webhook' }
      });
      return;
    }
    await markDonationPaid(donation._id, {
      paymentId: payment.id,
      payment,
      source: 'webhook',
      ip
    });
  }
}

async function handlePaymentFailed(payment, ip) {
  const rpOrderId = payment.order_id;
  const patch = { razorpayPaymentId: payment.id };

  const order = await Order.findOne({ razorpayOrderId: rpOrderId });
  if (order) {
    // Only a still-pending order is failed; a paid or refunded one is left alone.
    await markFailedIfPending(Order, order._id, patch);
    await PaymentLog.create({
      type: 'payment_failed',
      refModel: 'Order',
      refId: order._id,
      user: order.user,
      razorpayOrderId: rpOrderId,
      razorpayPaymentId: payment.id,
      amount: order.amount,
      ip,
      meta: { reason: payment.error_description, code: payment.error_code }
    });
    return;
  }

  const donation = await Donation.findOne({ razorpayOrderId: rpOrderId });
  if (donation) {
    await markFailedIfPending(Donation, donation._id, patch);
    await PaymentLog.create({
      type: 'payment_failed',
      refModel: 'Donation',
      refId: donation._id,
      razorpayOrderId: rpOrderId,
      razorpayPaymentId: payment.id,
      amount: donation.amount,
      ip,
      meta: { reason: payment.error_description, code: payment.error_code }
    });
  }
}

// Catches refunds issued directly from the Razorpay dashboard, so the site's own
// records stay in step with what actually happened to the money.
async function handleRefund(refund, ip) {
  const order = await Order.findOne({ razorpayPaymentId: refund.payment_id });
  if (!order) return;
  if (order.refund?.razorpayRefundId === refund.id && order.status === 'refunded') return;

  const isFull = Number(refund.amount) >= toPaise(order.amount);

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        ...(isFull ? { status: 'refunded' } : {}),
        'refund.status': isFull ? 'processed' : 'partial',
        'refund.razorpayRefundId': refund.id,
        'refund.amount': Number(refund.amount) / 100,
        'refund.processedAt': new Date()
      }
    }
  );

  if (isFull) await restoreStock(order);

  await PaymentLog.create({
    type: 'refund_processed',
    refModel: 'Order',
    refId: order._id,
    user: order.user,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: refund.payment_id,
    amount: Number(refund.amount) / 100,
    ip,
    meta: { razorpayRefundId: refund.id, source: 'webhook', partial: !isFull }
  });
}

module.exports = router;
