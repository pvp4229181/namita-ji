// Loads and renders the product grid on the shop page.
const Products = (() => {
  let all = [];
  const params = new URLSearchParams(location.search);
  let activeCat = params.get('category') || '';
  let query = (params.get('search') || '').trim();

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function render() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const normalizedQuery = query.toLowerCase();
    const list = all.filter((p) => {
      const matchesCategory = !activeCat || p.category === activeCat;
      const searchable = [p.name, p.category, p.description, p.unit, ...(p.tags || [])].join(' ').toLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
    const status = document.getElementById('searchStatus');
    const clear = document.getElementById('searchClear');
    if (status) status.textContent = query ? `${list.length} ${list.length === 1 ? 'product' : 'products'} found for “${query}”` : '';
    if (clear) clear.hidden = !query;
    if (list.length === 0) {
      grid.innerHTML = `<p class="empty-products">${query ? `No products match “${escapeHtml(query)}”. Try another search.` : 'No products in this category yet.'}</p>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (p) => `
      <a class="product-card${p.stock === 0 ? ' out-of-stock' : ''}" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <div class="product-img">
          <img src="${p.image || '/images/placeholder-food.svg'}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" />
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

    grid.querySelectorAll('.card-qty-stepper button').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const product = all.find((p) => p._id === btn.dataset.id);
        if (!product) return;
        if (btn.dataset.action === 'increase') Cart.add(product, 1);
        else Cart.updateQty(product._id, -1);
      };
    });
    syncCardQuantities();
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

  function discountBadge(p) {
    if (!p.mrp || p.mrp <= p.price) return '';
    const pct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    return `<span class="discount-badge">${pct}% OFF</span>`;
  }

  async function load() {
    try {
      const data = USE_STATIC_PRODUCTS ? await ProductsAPI.list() : await api('/products');
      all = data.products || [];
      render();
    } catch (err) {
      const grid = document.getElementById('productGrid');
      if (grid) grid.innerHTML = '<p style="text-align:center;color:var(--danger);">Could not load products. Please refresh.</p>';
    }
  }

  function init() {
    const searchInput = document.getElementById('shopSearch');
    const headerSearch = document.getElementById('shopHeaderSearch');
    if (searchInput) searchInput.value = query;
    if (headerSearch) headerSearch.value = query;
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
    document.getElementById('shopSearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      query = searchInput.value.trim();
      const url = new URL(location.href);
      if (query) url.searchParams.set('search', query);
      else url.searchParams.delete('search');
      history.replaceState({}, '', url);
      if (headerSearch) headerSearch.value = query;
      render();
    });
    document.getElementById('searchClear')?.addEventListener('click', () => {
      query = '';
      if (searchInput) searchInput.value = '';
      if (headerSearch) headerSearch.value = '';
      const url = new URL(location.href);
      url.searchParams.delete('search');
      history.replaceState({}, '', url);
      render();
      searchInput?.focus();
    });
    document.addEventListener('cart:updated', syncCardQuantities);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Products.init);
