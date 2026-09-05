const mongoose = require('mongoose');

// Immutable audit trail of every payment-related event (order create, verify attempt,
// signature failure, webhook hit, refund). Never edit/delete rows here — this is the
// anti-fraud paper trail admins rely on, and what you'd hand to Razorpay in a dispute.
const paymentLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'order_created',
        'donation_order_created',
        'verify_success',
        'verify_failure',
        'amount_mismatch',
        'payment_failed',
        'stock_shortfall',
        'webhook_received',
        'webhook_signature_invalid',
        'webhook_error',
        'refund_requested',
        'refund_processed',
        'refund_rejected',
        'refund_failed'
      ],
      required: true,
      index: true
    },
    refModel: { type: String, enum: ['Order', 'Donation'] },
    refId: { type: mongoose.Schema.Types.ObjectId, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    amount: Number,
    ip: String,
    meta: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

paymentLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaymentLog', paymentLogSchema);
