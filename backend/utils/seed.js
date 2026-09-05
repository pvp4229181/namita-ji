// One-off script: creates the first admin account and sample products.
// Run with: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Product = require('../models/Product');

const sampleProducts = [
  {
    name: 'Namkeen Mixture',
    slug: 'namkeen-mixture',
    description: 'Classic spicy Bihari-style mixture, deep-fried and roasted.',
    category: 'Namkeen',
    price: 180,
    mrp: 220,
    unit: '400g',
    image: '/images/mixture-delicious.jpg'
  },
  {
    name: 'Thekua',
    slug: 'thekua',
    description: 'Traditional wheat-jaggery sweet, a Chhath Puja favourite.',
    category: 'Sweets',
    price: 220,
    mrp: 260,
    unit: '500g',
    image: '/images/thekua-delicious.jpg'
  },
  {
    name: 'Anarsa',
    slug: 'anarsa',
    description: 'Rice-flour sweet coated in sesame seeds.',
    category: 'Sweets',
    price: 260,
    mrp: 300,
    unit: '400g',
    image: '/images/anarsa-delicious.jpg'
  },
  {
    name: 'Litti Masala Mix',
    slug: 'litti-masala-mix',
    description: 'Ready sattu masala mix for authentic homemade litti.',
    category: 'Ready Mix',
    price: 150,
    mrp: 180,
    unit: '250g',
    image: '/images/litti-masala-mix.jpg'
  },
  {
    name: 'Chana Chur',
    slug: 'chana-chur',
    description: 'Crunchy roasted chana namkeen with tangy spices.',
    category: 'Namkeen',
    price: 140,
    mrp: 160,
    unit: '350g',
    image: '/images/chana-chur.jpg'
  },
  {
    name: 'Khaja',
    slug: 'khaja',
    description: 'Layered, flaky sweet soaked in sugar syrup.',
    category: 'Sweets',
    price: 240,
    mrp: 280,
    unit: '400g',
    image: '/images/khaja-delicious.jpg'
  },
  {
    name: 'Balushahi',
    slug: 'balushahi',
    description: 'Rich, flaky ghee sweet with a delicate sugar glaze.',
    category: 'Sweets',
    price: 280,
    mrp: 330,
    unit: '400g',
    image: '/images/balushahi.jpg',
    tags: ['ghee sweet', 'traditional mithai']
  },
  {
    name: 'Gaya Tilkut',
    slug: 'gaya-tilkut',
    description: 'Classic Gaya sweet made with roasted sesame and sugar.',
    category: 'Sweets',
    price: 300,
    mrp: 350,
    unit: '300g',
    image: '/images/gaya-tilkut.jpg',
    tags: ['sesame', 'gaya special', 'tilkut']
  },
  {
    name: 'Pedakiya',
    slug: 'pedakiya',
    description: 'Crisp Bihari pastry filled with coconut and khoya.',
    category: 'Sweets',
    price: 260,
    mrp: 300,
    unit: '400g',
    image: '/images/pedakiya.jpg',
    tags: ['gujiya', 'coconut', 'khoya']
  },
  {
    name: 'Masala Peanuts',
    slug: 'masala-peanuts',
    description: 'Crunchy peanuts coated in a spicy gram-flour masala.',
    category: 'Namkeen',
    price: 160,
    mrp: 190,
    unit: '300g',
    image: '/images/masala-peanuts.jpg',
    tags: ['peanut', 'spicy', 'chai time']
  },
  {
    name: 'Moong Dal Namkeen',
    slug: 'moong-dal-namkeen',
    description: 'Lightly salted and crisp fried moong dal snack.',
    category: 'Namkeen',
    price: 170,
    mrp: 200,
    unit: '300g',
    image: '/images/moong-dal-namkeen.jpg',
    tags: ['moong dal', 'crunchy', 'tea snack']
  },
  {
    name: 'Khatta Meetha Mix',
    slug: 'khatta-meetha-mix',
    description: 'A sweet, tangy and crunchy namkeen blend for chai time.',
    category: 'Namkeen',
    price: 180,
    mrp: 220,
    unit: '400g',
    image: '/images/khatta-meetha-mix.jpg',
    tags: ['sweet and sour', 'mixture', 'chai time']
  }
];

async function seed() {
  await connectDB();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    let admin = await User.findOne({ email: email.toLowerCase() });
    if (!admin) {
      admin = new User({ name: 'Admin', email: email.toLowerCase(), role: 'admin' });
      await admin.setPassword(password);
      await admin.save();
      console.log('Admin account created:', email);
    } else {
      console.log('Admin account already exists:', email);
    }
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation.');
  }

  for (const p of sampleProducts) {
    await Product.findOneAndUpdate({ slug: p.slug }, p, { upsert: true, setDefaultsOnInsert: true });
  }
  console.log('Sample products ensured (images updated).');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
