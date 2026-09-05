const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional, donations can be by guests
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    amount: { type: Number, required: true, min: 1 },
    message: { type: String, default: '' },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, index: true },
    razorpaySignature: String,
    paymentMethod: String,
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
    paidAt: Date
  },
  { timestamps: true }
);

donationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);
