const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Snacks', index: true },
    price: { type: Number, required: true, min: 0 }, // in INR
    mrp: { type: Number, min: 0 }, // optional strike-through price
    unit: { type: String, default: '250g' },
    image: { type: String, default: '/images/placeholder-food.svg' },
    stock: { type: Number, default: 100, min: 0 },
    isActive: { type: Boolean, default: true },
    tags: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
