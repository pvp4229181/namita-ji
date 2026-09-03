// Loads and renders the product grid on the shop page.
const Products = (() => {
  let all = [];
  const params = new URLSearchParams(location.search);
  let activeCat = params.get('category') || '';

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function render() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const list = activeCat ? all.filter((p) => p.category === activeCat) : all;
    if (list.length === 0) {
      grid.innerHTML = '<p style="text-align:center;color:var(--muted);">No products in this category yet.</p>';
      return;
    }
    grid.innerHTML = list
      .map(
        (p) => `
      <a class="product-card${p.stock === 0 ? ' out-of-stock' : ''}" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <div class="product-img">
          <img src="${p.image || '/images/placeholder-food.svg'}" alt="${escapeHtml(p.name)}" />
          ${p.stock === 0 ? '<span class="stock-badge">Out of Stock</span>' : discountBadge(p)}
        </div>
        <div class="product-body">
          <div class="product-cat">${escapeHtml(p.category)}</div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-unit">${escapeHtml(p.unit || '')}</div>
          <div class="product-price-row">
            <span class="price">${formatINR(p.price)}</span>
            ${p.mrp ? `<span class="mrp">${formatINR(p.mrp)}</span>` : ''}
          </div>
          <div class="product-footer">
            <button class="btn btn-primary btn-sm btn-block add-to-cart" data-id="${p._id}" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Out of Stock' : '+ Add to Cart'}</button>
          </div>
        </div>
      </a>`
      )
      .join('');

    grid.querySelectorAll('.add-to-cart').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const product = all.find((p) => p._id === btn.dataset.id);
        if (!product) return;
        Cart.add(product, 1);
        const original = btn.textContent;
        btn.textContent = 'Added ✓';
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('added');
        }, 1500);
      };
    });
  }

  function discountBadge(p) {
    if (!p.mrp || p.mrp <= p.price) return '';
    const pct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    return `<span class="discount-badge">${pct}% OFF</span>`;
  }

  async function load() {
    try {
      const data = await api('/products');
      all = data.products || [];
      render();
    } catch (err) {
      const grid = document.getElementById('productGrid');
      if (grid) grid.innerHTML = '<p style="text-align:center;color:var(--danger);">Could not load products. Please refresh.</p>';
    }
  }

  function init() {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === activeCat));
    load();
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.onclick = () => {
        document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeCat = chip.dataset.cat;
        const url = new URL(location.href);
        if (activeCat) url.searchParams.set('category', activeCat);
        else url.searchParams.delete('category');
        history.replaceState({}, '', url);
        render();
      };
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Products.init);
