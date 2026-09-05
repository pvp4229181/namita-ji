const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // price at time of purchase
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true, validate: (v) => v.length > 0 },
    itemsTotal: { type: Number, required: true }, // sum of item price*qty, INR
    shipping: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // final payable amount in INR
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      phone: String
    },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, index: true },
    razorpaySignature: { type: String },
    paymentMethod: { type: String }, // upi / card / netbanking, as reported by Razorpay
    capturedAtRazorpay: { type: Boolean, default: false }, // false = authorized but not yet captured
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refund_requested', 'refunded'],
      default: 'created',
      index: true
    },
    // Guards the stock side effect so verify and the webhook racing on the same
    // order can only ever decrement (or restore) inventory once. See utils/payments.js.
    stockAdjusted: { type: Boolean, default: false },
    stockWarning: { type: String },
    refund: {
      requestedAt: Date,
      reason: String,
      status: {
        type: String,
        enum: ['none', 'requested', 'approved', 'rejected', 'processing', 'partial', 'processed'],
        default: 'none'
      },
      amount: Number,
      razorpayRefundId: String,
      processedAt: Date,
      adminNote: String
    },
    paidAt: Date
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'refund.status': 1 });

module.exports = mongoose.model('Order', orderSchema);
