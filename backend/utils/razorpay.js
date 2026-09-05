const Razorpay = require('razorpay');
const crypto = require('crypto');

let instance = null;
function getRazorpay() {
  if (!instance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys are not configured in .env');
    }
    instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return instance;
}

// Constant-time string compare. A plain `===` on an HMAC leaks, through response
// timing, how many leading characters of a guess were correct — enough, over many
// requests, to forge a signature one character at a time.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Verifies the signature Razorpay Checkout returns after a successful payment.
// This MUST pass before an order/donation is ever marked "paid" — it is the control
// standing between this app and a forged "I paid" callback.
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error('RAZORPAY_KEY_SECRET is not configured');
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

// Verifies the X-Razorpay-Signature header on incoming webhooks.
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

// Pulls the payment straight from Razorpay's API. The signature proves the callback
// is genuine; this proves what was actually charged, so the amount can be checked
// against our own record before anything is marked paid.
async function fetchPayment(paymentId) {
  return getRazorpay().payments.fetch(paymentId);
}

module.exports = { getRazorpay, verifyPaymentSignature, verifyWebhookSignature, fetchPayment, safeEqual };
