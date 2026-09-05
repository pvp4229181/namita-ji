// Renders a fixed "Bestsellers" grid on the home page (minimum 6 cards).
const Bestsellers = (() => {
  const MIN_CARDS = 6;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function cardHtml(p) {
    return `
      <a class="product-card${p.stock === 0 ? ' out-of-stock' : ''}" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <div class="product-img">
          <img src="${p.image || '/images/placeholder-food.svg'}" alt="${escapeHtml(p.name)}" />
          ${p.stock === 0 ? '<span class="stock-badge">Out of Stock</span>' : discountBadge(p)}
        </div>
        <div class="product-body">
          <div class="product-cat">${escapeHtml(p.category)}</div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-unit">${escapeHtml(p.unit || '')}</div>
          <div class="product-purchase">
            <div class="product-price-row">
              <span class="price">${formatINR(p.price)}</span>
              ${p.mrp ? `<span class="mrp">${formatINR(p.mrp)}</span>` : ''}
            </div>
            <div class="product-footer">
              ${quantityControl(p)}
            </div>
          </div>
        </div>
      </a>`;
  }

  function discountBadge(p) {
    if (!p.mrp || p.mrp <= p.price) return '';
    const pct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    return `<span class="discount-badge">${pct}% OFF</span>`;
  }

  async function load() {
    const grid = document.getElementById('bestsellerGrid');
    if (!grid) return;
    try {
      const data = USE_STATIC_PRODUCTS ? await ProductsAPI.list() : await api('/products');
      const products = (data.products || []).slice(0, Math.max(MIN_CARDS, 6));
      if (products.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1;">Bestsellers coming soon.</p>';
        return;
      }
      grid.innerHTML = products.map(cardHtml).join('');
      grid.querySelectorAll('.add-to-cart').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const product = products.find((p) => p._id === btn.dataset.id);
          if (!product) return;
          Cart.add(product, 1);
          const original = btn.textContent;
          btn.textContent = 'Added ✓';
          setTimeout(() => { btn.textContent = original; }, 1500);
        };
      });
      grid.querySelectorAll('.card-qty-stepper button').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const product = products.find((p) => p._id === btn.dataset.id);
          if (!product) return;
          if (btn.dataset.action === 'increase') Cart.add(product, 1);
          else Cart.updateQty(product._id, -1);
        };
      });
      syncCardQuantities();
    } catch (err) {
      grid.innerHTML = '<p style="text-align:center;color:var(--danger);grid-column:1/-1;">Could not load bestsellers.</p>';
    }
  }

  function quantityControl(p) {
    if (p.stock === 0) return '<button class="btn btn-primary btn-sm btn-block" disabled>Out of Stock</button>';
    const qty = Cart.quantity(p._id);
    return `<div class="card-qty-stepper" data-id="${p._id}"><button type="button" data-action="decrease" data-id="${p._id}" aria-label="Remove one ${escapeHtml(p.name)}" ${qty === 0 ? 'disabled' : ''}>−</button><span data-card-qty>${qty}</span><button type="button" data-action="increase" data-id="${p._id}" aria-label="Add one ${escapeHtml(p.name)}">+</button></div>`;
  }

  function syncCardQuantities() {
    document.querySelectorAll('.card-qty-stepper').forEach((control) => {
      const qty = Cart.quantity(control.dataset.id);
      control.querySelector('[data-card-qty]').textContent = qty;
      control.querySelector('[data-action="decrease"]').disabled = qty === 0;
    });
  }

  document.addEventListener('cart:updated', syncCardQuantities);
  return { init: load };
})();

document.addEventListener('DOMContentLoaded', Bestsellers.init);
