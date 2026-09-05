const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home' },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true }
  },
  { _id: true, timestamps: true }
);

// A real sub-schema (not a plain nested-object shape) so an absent
// `verification` path stays `undefined` on hydrate instead of Mongoose
// auto-vivifying it as `{}` — that undefined-vs-set distinction is how
// login tells "account predates this feature, exempt" apart from
// "not yet verified". See routes/auth.js.
const otpChannelSchema = new mongoose.Schema(
  {
    codeHash: { type: String },
    expiresAt: { type: Date },
    verified: { type: Boolean },
    attempts: { type: Number }
  },
  { _id: false }
);

// Wrapping email/phone in their own Schema (rather than a plain { email: {...} }
// object) makes `verification` itself a real single-nested-subdocument type,
// which Mongoose leaves genuinely `undefined` when absent — a plain nested
// object path instead auto-vivifies to `{}` on every hydrate, which would
// defeat the undefined-vs-set check in routes/auth.js.
const verificationSchema = new mongoose.Schema(
  {
    email: otpChannelSchema,
    phone: otpChannelSchema
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Invalid email address']
    },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    addresses: [addressSchema],
    isActive: { type: Boolean, default: true },
    // Sessions issued before this moment are rejected, so changing the password
    // really does sign the account out everywhere. See middleware/auth.js.
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    welcomeEmail: {
      status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
      sentAt: { type: Date },
      error: { type: String }
    },
    verification: verificationSchema
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
  if (!this.isNew) this.passwordChangedAt = new Date();
};

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    addresses: this.addresses,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
