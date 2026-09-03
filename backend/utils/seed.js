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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mixture%20(the%20Indian%20snack)%20in%20Chennai.JPG'
  },
  {
    name: 'Thekua',
    slug: 'thekua',
    description: 'Traditional wheat-jaggery sweet, a Chhath Puja favourite.',
    category: 'Sweets',
    price: 220,
    mrp: 260,
    unit: '500g',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Thekuaa.jpg'
  },
  {
    name: 'Anarsa',
    slug: 'anarsa',
    description: 'Rice-flour sweet coated in sesame seeds.',
    category: 'Sweets',
    price: 260,
    mrp: 300,
    unit: '400g',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Magahi%20Anarsa.jpg'
  },
  {
    name: 'Litti Masala Mix',
    slug: 'litti-masala-mix',
    description: 'Ready sattu masala mix for authentic homemade litti.',
    category: 'Ready Mix',
    price: 150,
    mrp: 180,
    unit: '250g',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Litti%20Chokha%2001.jpg'
  },
  {
    name: 'Chana Chur',
    slug: 'chana-chur',
    description: 'Crunchy roasted chana namkeen with tangy spices.',
    category: 'Namkeen',
    price: 140,
    mrp: 160,
    unit: '350g',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Besan%20ke%20sev.JPG'
  },
  {
    name: 'Khaja',
    slug: 'khaja',
    description: 'Layered, flaky sweet soaked in sugar syrup.',
    category: 'Sweets',
    price: 240,
    mrp: 280,
    unit: '400g',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kakinada%20Khaja%20or%20Kotayya%20Khaja%20or%20Gottam%20Khaja-%20Sweet%20From%20kakinada%2C%20Andhrapradesh.JPG'
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
