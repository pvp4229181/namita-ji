// Cart state (localStorage-backed) + drawer UI.
// NOTE: no coupon/promo code field anywhere in this drawer, by design.
const Cart = (() => {
  const KEY = 'nj_cart';
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch (e) {
    items = [];
  }

  const SHIPPING_FLAT_FEE = 49;
  const FREE_SHIPPING_THRESHOLD = 499;

  function save() {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadge();
  }

  function add(product, qty = 1) {
    const existing = items.find((i) => i.productId === product._id);
    if (existing) {
      existing.quantity += qty;
    } else {
      items.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: qty
      });
    }
    save();
    render();
    showToast(`${product.name} added to cart`, 'success');
  }

  function updateQty(productId, delta) {
    const item = items.find((i) => i.productId === productId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) items = items.filter((i) => i.productId !== productId);
    save();
    render();
  }

  function remove(productId) {
    items = items.filter((i) => i.productId !== productId);
    save();
    render();
  }

  function clear() {
    items = [];
    save();
    render();
  }

  function itemsTotal() {
    return items.reduce((s, i) => s + i.price * i.quantity, 0);
  }

  function shippingFee() {
    if (items.length === 0) return 0;
    return itemsTotal() >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_FEE;
  }

  function grandTotal() {
    return itemsTotal() + shippingFee();
  }

  function count() {
    return items.reduce((s, i) => s + i.quantity, 0);
  }

  function updateBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const c = count();
    badge.textContent = c;
    badge.hidden = c === 0;
  }

  function render() {
    const body = document.getElementById('cartBody');
    const footer = document.getElementById('cartFooter');
    if (!body) return;

    if (items.length === 0) {
      body.innerHTML = '<div class="empty-cart">Your cart is empty.<br/>Add some delicious snacks!</div>';
      if (footer) footer.hidden = true;
      return;
    }

    body.innerHTML = items
      .map(
        (i) => `
      <div class="cart-item" data-id="${i.productId}">
        <img src="${i.image || '/images/placeholder-food.svg'}" alt="${escapeHtml(i.name)}" />
        <div class="cart-item-info">
          <div class="name">${escapeHtml(i.name)}</div>
          <div class="price">${formatINR(i.price)} x ${i.quantity} = ${formatINR(i.price * i.quantity)}</div>
          <div class="cart-item-actions">
            <div class="qty-stepper">
              <button class="dec" data-id="${i.productId}">−</button>
              <span>${i.quantity}</span>
              <button class="inc" data-id="${i.productId}">+</button>
            </div>
            <button class="remove-link" data-id="${i.productId}">Remove</button>
          </div>
        </div>
      </div>`
      )
      .join('');

    body.querySelectorAll('.inc').forEach((b) => (b.onclick = () => updateQty(b.dataset.id, 1)));
    body.querySelectorAll('.dec').forEach((b) => (b.onclick = () => updateQty(b.dataset.id, -1)));
    body.querySelectorAll('.remove-link').forEach((b) => (b.onclick = () => remove(b.dataset.id)));

    if (footer) {
      footer.hidden = false;
      document.getElementById('sumItems').textContent = formatINR(itemsTotal());
      document.getElementById('sumShipping').textContent = shippingFee() === 0 ? 'FREE' : formatINR(shippingFee());
      document.getElementById('sumTotal').textContent = formatINR(grandTotal());
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function openDrawer() {
    document.getElementById('overlay').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    render();
  }

  function closeDrawer() {
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('cartDrawer').classList.remove('open');
  }

  function init() {
    document.getElementById('cartBtn').onclick = openDrawer;
    document.getElementById('closeCart').onclick = closeDrawer;
    document.getElementById('overlay').onclick = closeDrawer;
    updateBadge();
    render();
  }

  return { add, updateQty, remove, clear, items: () => items, itemsTotal, shippingFee, grandTotal, count, openDrawer, closeDrawer, init, render };
})();

document.addEventListener('DOMContentLoaded', Cart.init);
