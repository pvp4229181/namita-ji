// Static product catalog for the frontend. Mirrors backend/utils/seed.js so the
// two stay in sync while the shop runs off this file instead of /api/products.
//
// To switch a page back to the live backend later, change its ProductsAPI call
// from `.local()` to the corresponding `api(...)` call in js/api.js — see the
// `USE_STATIC_PRODUCTS` flag below, which every consumer (products.js,
// bestsellers.js, product-detail.js) reads before deciding where to fetch from.
const USE_STATIC_PRODUCTS = true;

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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mixture%20(the%20Indian%20snack)%20in%20Chennai.JPG',
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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Thekuaa.jpg',
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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Magahi%20Anarsa.jpg',
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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Litti%20Chokha%2001.jpg',
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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Besan%20ke%20sev.JPG',
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
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kakinada%20Khaja%20or%20Kotayya%20Khaja%20or%20Gottam%20Khaja-%20Sweet%20From%20kakinada%2C%20Andhrapradesh.JPG',
    stock: 100,
    isActive: true,
    tags: []
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
