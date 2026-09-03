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

// Verifies the signature Razorpay's Checkout returns after a successful payment.
// This MUST pass before an order/donation is ever marked "paid" — this is the
// single control standing between this app and a fake/forged "I paid" claim.
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

// Verifies the X-Razorpay-Signature header on incoming webhooks.
function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
}

module.exports = { getRazorpay, verifyPaymentSignature, verifyWebhookSignature };
