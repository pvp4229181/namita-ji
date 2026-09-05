// Static product catalog for the frontend. Mirrors backend/utils/seed.js so the
// two stay in sync while the shop runs off this file instead of /api/products.
//
// To switch a page back to the live backend later, change its ProductsAPI call
// from `.local()` to the corresponding `api(...)` call in js/api.js — see the
// `USE_STATIC_PRODUCTS` flag below, which every consumer (products.js,
// bestsellers.js, product-detail.js) reads before deciding where to fetch from.
const USE_STATIC_PRODUCTS = false;

const STATIC_PRODUCTS = [
  {
    _id: 'namkeen-mixture',
    name: 'Namkeen Mixture',
    slug: 'namkeen-mixture',
    description: 'Classic spicy Bihari-style mixture, deep-fried and roasted.',
    category: 'Namkeen',
    price: 180,
    mrp: 220,
    unit: '400g',
    image: '/images/mixture-delicious.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'thekua',
    name: 'Thekua',
    slug: 'thekua',
    description: 'Traditional wheat-jaggery sweet, a Chhath Puja favourite.',
    category: 'Sweets',
    price: 220,
    mrp: 260,
    unit: '500g',
    image: '/images/thekua-delicious.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'anarsa',
    name: 'Anarsa',
    slug: 'anarsa',
    description: 'Rice-flour sweet coated in sesame seeds.',
    category: 'Sweets',
    price: 260,
    mrp: 300,
    unit: '400g',
    image: '/images/anarsa-delicious.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'litti-masala-mix',
    name: 'Litti Masala Mix',
    slug: 'litti-masala-mix',
    description: 'Ready sattu masala mix for authentic homemade litti.',
    category: 'Ready Mix',
    price: 150,
    mrp: 180,
    unit: '250g',
    image: '/images/litti-masala-mix.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'chana-chur',
    name: 'Chana Chur',
    slug: 'chana-chur',
    description: 'Crunchy roasted chana namkeen with tangy spices.',
    category: 'Namkeen',
    price: 140,
    mrp: 160,
    unit: '350g',
    image: '/images/chana-chur.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'khaja',
    name: 'Khaja',
    slug: 'khaja',
    description: 'Layered, flaky sweet soaked in sugar syrup.',
    category: 'Sweets',
    price: 240,
    mrp: 280,
    unit: '400g',
    image: '/images/khaja-delicious.jpg',
    stock: 100,
    isActive: true,
    tags: []
  },
  {
    _id: 'balushahi',
    name: 'Balushahi',
    slug: 'balushahi',
    description: 'Rich, flaky ghee sweet with a delicate sugar glaze.',
    category: 'Sweets',
    price: 280,
    mrp: 330,
    unit: '400g',
    image: '/images/balushahi.jpg',
    stock: 100,
    isActive: true,
    tags: ['ghee sweet', 'traditional mithai']
  },
  {
    _id: 'tilkut',
    name: 'Gaya Tilkut',
    slug: 'gaya-tilkut',
    description: 'Classic Gaya sweet made with roasted sesame and sugar.',
    category: 'Sweets',
    price: 300,
    mrp: 350,
    unit: '300g',
    image: '/images/gaya-tilkut.jpg',
    stock: 100,
    isActive: true,
    tags: ['sesame', 'gaya special', 'tilkut']
  },
  {
    _id: 'pedakiya',
    name: 'Pedakiya',
    slug: 'pedakiya',
    description: 'Crisp Bihari pastry filled with coconut and khoya.',
    category: 'Sweets',
    price: 260,
    mrp: 300,
    unit: '400g',
    image: '/images/pedakiya.jpg',
    stock: 100,
    isActive: true,
    tags: ['gujiya', 'coconut', 'khoya']
  },
  {
    _id: 'masala-peanuts',
    name: 'Masala Peanuts',
    slug: 'masala-peanuts',
    description: 'Crunchy peanuts coated in a spicy gram-flour masala.',
    category: 'Namkeen',
    price: 160,
    mrp: 190,
    unit: '300g',
    image: '/images/masala-peanuts.jpg',
    stock: 100,
    isActive: true,
    tags: ['peanut', 'spicy', 'chai time']
  },
  {
    _id: 'moong-dal-namkeen',
    name: 'Moong Dal Namkeen',
    slug: 'moong-dal-namkeen',
    description: 'Lightly salted and crisp fried moong dal snack.',
    category: 'Namkeen',
    price: 170,
    mrp: 200,
    unit: '300g',
    image: '/images/moong-dal-namkeen.jpg',
    stock: 100,
    isActive: true,
    tags: ['moong dal', 'crunchy', 'tea snack']
  },
  {
    _id: 'khatta-meetha-mix',
    name: 'Khatta Meetha Mix',
    slug: 'khatta-meetha-mix',
    description: 'A sweet, tangy and crunchy namkeen blend for chai time.',
    category: 'Namkeen',
    price: 180,
    mrp: 220,
    unit: '400g',
    image: '/images/khatta-meetha-mix.jpg',
    stock: 100,
    isActive: true,
    tags: ['sweet and sour', 'mixture', 'chai time']
  }
];

// Same shapes /api/products and /api/products/:slug return, so callers don't
// need to branch on where the data came from.
const ProductsAPI = {
  list() {
    return Promise.resolve({ products: STATIC_PRODUCTS });
  },
  get(slug) {
    const product = STATIC_PRODUCTS.find((p) => p.slug === slug);
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      return Promise.reject(err);
    }
    return Promise.resolve({ product });
  }
};
