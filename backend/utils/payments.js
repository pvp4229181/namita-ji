// Shared money-critical logic. Both the browser callback (/verify) and the Razorpay
// webhook funnel through here, so the two paths can never drift apart or double-apply
// a side effect (stock, logs) when they race each other on the same payment.
const Order = require('../models/Order');
const Donation = require('../models/Donation');
const Product = require('../models/Product');
const PaymentLog = require('../models/PaymentLog');
const { fetchPayment } = require('./razorpay');

// A payment we are willing to treat as money received. `authorized` means the funds
// are held but not yet settled — recorded as paid, but flagged so an admin can see
// it still needs capture in the Razorpay dashboard.
const ACCEPTABLE_STATUSES = new Set(['captured', 'authorized']);

// Statuses an order/donation may legally move *into* "paid" from. Anything already
// paid, refunded, or mid-refund is left untouched — a late webhook must never
// resurrect a refunded order.
const PAYABLE_FROM = ['created', 'failed'];

function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

// Confirms the payment Razorpay reports actually belongs to this order and is for
// exactly the amount we computed server-side. Returns null when everything lines up,
// or a human-readable reason when it does not.
function checkPaymentMatches(payment, { razorpayOrderId, amountInPaise }) {
  if (!payment) return 'Payment not found at Razorpay';
  if (payment.order_id !== razorpayOrderId) return 'Payment does not belong to this order';
  if (payment.currency !== 'INR') return `Unexpected currency: ${payment.currency}`;
  if (Number(payment.amount) !== amountInPaise) {
    return `Amount mismatch: expected ${amountInPaise} paise, Razorpay reports ${payment.amount}`;
  }
  if (!ACCEPTABLE_STATUSES.has(payment.status)) return `Payment status is "${payment.status}", not captured`;
  return null;
}

// Fetches the payment from Razorpay and validates it against our stored record.
// Throws a PaymentMismatchError-shaped error when it does not match.
async function assertPaymentMatchesRecord(paymentId, { razorpayOrderId, amountInRupees }) {
  let payment;
  try {
    payment = await fetchPayment(paymentId);
  } catch (err) {
    // 400/404 mean Razorpay has definitively answered: no such payment. That is a
    // real failure. Anything else — a network error, a 5xx, a rate limit, or our own
    // credentials being wrong (401/403) — means Razorpay could not answer. The
    // customer may genuinely have paid, so leave the record pending for the webhook
    // to settle rather than wrongly declaring failure.
    const status = err.statusCode || err.status;
    const definitive = status === 400 || status === 404;
    const e = new Error(
      definitive ? 'Razorpay has no such payment for this order' : 'Could not confirm this payment with Razorpay'
    );
    e.cause = err;
    e.code = definitive ? 'MISMATCH' : 'FETCH_FAILED';
    throw e;
  }
  const problem = checkPaymentMatches(payment, {
    razorpayOrderId,
    amountInPaise: toPaise(amountInRupees)
  });
  if (problem) {
    const e = new Error(problem);
    e.code = 'MISMATCH';
    e.payment = payment;
    throw e;
  }
  return payment;
}

// Decrements stock exactly once per order, whichever path gets here first.
// The `stockAdjusted` flag is claimed atomically, so verify and the webhook racing
// on the same order can only ever apply the decrement one time.
async function applyStock(order) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, stockAdjusted: { $ne: true } },
    { $set: { stockAdjusted: true } }
  );
  if (!claimed) return; // another path already adjusted stock for this order

  const shortfalls = [];
  for (const item of order.items) {
    // Conditional decrement — never lets stock go negative even under concurrent orders.
    const result = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } }
    );
    if (result.modifiedCount === 0) {
      // Oversold: the payment is already taken, so we honour it, zero the stock and
      // flag the order rather than failing a paid customer.
      await Product.updateOne({ _id: item.product }, { $set: { stock: 0 } });
      shortfalls.push(item.name);
    }
  }

  if (shortfalls.length) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { stockWarning: `Insufficient stock at capture: ${shortfalls.join(', ')}` } }
    );
    await PaymentLog.create({
      type: 'stock_shortfall',
      refModel: 'Order',
      refId: order._id,
      user: order.user,
      meta: { items: shortfalls }
    });
  }
}

// Puts stock back after a refund — again exactly once.
async function restoreStock(order) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, stockAdjusted: true },
    { $set: { stockAdjusted: false } }
  );
  if (!claimed) return;
  for (const item of order.items) {
    await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
  }
}

// The single place an Order becomes "paid". Idempotent by construction: the status
// transition is a conditional atomic update, so a second call (webhook after verify,
// a retried request, a double-clicked button) returns the existing order untouched.
async function markOrderPaid(orderId, { paymentId, signature, payment, source, ip }) {
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: PAYABLE_FROM } },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: paymentId,
        paidAt: new Date(),
        ...(signature ? { razorpaySignature: signature } : {}),
        ...(payment ? { paymentMethod: payment.method, capturedAtRazorpay: payment.status === 'captured' } : {})
      }
    },
    { new: true }
  );

  if (!updated) {
    const existing = await Order.findById(orderId);
    return { order: existing, alreadyPaid: true };
  }

  await applyStock(updated);
  await PaymentLog.create({
    type: 'verify_success',
    refModel: 'Order',
    refId: updated._id,
    user: updated.user,
    razorpayOrderId: updated.razorpayOrderId,
    razorpayPaymentId: paymentId,
    amount: updated.amount,
    ip,
    meta: { source, method: payment?.method, razorpayStatus: payment?.status }
  });

  return { order: updated, alreadyPaid: false };
}

// Same contract as markOrderPaid, for donations (no stock involved).
async function markDonationPaid(donationId, { paymentId, signature, payment, source, ip }) {
  const updated = await Donation.findOneAndUpdate(
    { _id: donationId, status: { $in: PAYABLE_FROM } },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: paymentId,
        paidAt: new Date(),
        ...(signature ? { razorpaySignature: signature } : {}),
        ...(payment ? { paymentMethod: payment.method } : {})
      }
    },
    { new: true }
  );

  if (!updated) {
    const existing = await Donation.findById(donationId);
    return { donation: existing, alreadyPaid: true };
  }

  await PaymentLog.create({
    type: 'verify_success',
    refModel: 'Donation',
    refId: updated._id,
    user: updated.user,
    razorpayOrderId: updated.razorpayOrderId,
    razorpayPaymentId: paymentId,
    amount: updated.amount,
    ip,
    meta: { source, method: payment?.method, razorpayStatus: payment?.status }
  });

  return { donation: updated, alreadyPaid: false };
}

// A failed verification must never downgrade something already paid or refunded —
// otherwise anyone holding an id could corrupt the record of a real payment.
// Only a still-pending record is moved to "failed".
async function markFailedIfPending(Model, id, patch = {}) {
  return Model.findOneAndUpdate(
    { _id: id, status: 'created' },
    { $set: { status: 'failed', ...patch } },
    { new: true }
  );
}

module.exports = {
  toPaise,
  checkPaymentMatches,
  assertPaymentMatchesRecord,
  applyStock,
  restoreStock,
  markOrderPaid,
  markDonationPaid,
  markFailedIfPending,
  PAYABLE_FROM
};
