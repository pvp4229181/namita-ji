// Amazon-style product detail page: image, description, price, reviews.
function escapeHtmlPD(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

function starsHtml(rating) {
  const full = Math.round(rating);
  return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
}

let currentProduct = null;
let selectedRating = 0;

async function loadProduct() {
  const slug = new URLSearchParams(location.search).get('slug');
  const wrap = document.getElementById('pdpWrap');
  if (!slug) {
    wrap.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--danger);">Product not found.</p>';
    return;
  }

  try {
    const { product } = await api(`/products/${encodeURIComponent(slug)}`);
    currentProduct = product;
    renderProduct(product);
    loadReviews(slug);
  } catch (err) {
    wrap.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);">${escapeHtmlPD(err.message)}</p>`;
  }
}

function renderProduct(p) {
  document.title = `${p.name} — Namita Ji`;
  document.getElementById('pageTitle').textContent = `${p.name} — Namita Ji`;
  document.getElementById('crumbName').textContent = p.name;

  const savePct = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const stockClass = p.stock === 0 ? 'out' : p.stock <= 10 ? 'low' : 'in';
  const stockText = p.stock === 0 ? 'Out of stock' : p.stock <= 10 ? `Only ${p.stock} left in stock` : 'In stock';

  document.getElementById('pdpWrap').innerHTML = `
    <div class="pdp-media"><img src="${p.image || '/images/placeholder-food.svg'}" alt="${escapeHtmlPD(p.name)}" /></div>
    <div class="pdp-info">
      <span class="pdp-cat">${escapeHtmlPD(p.category)}</span>
      <h1 class="pdp-title">${escapeHtmlPD(p.name)}</h1>
      <div class="pdp-rating" id="pdpRatingRow"><span class="count">No ratings yet</span></div>
      <div class="pdp-price-row">
        <span class="pdp-price">${formatINR(p.price)}</span>
        ${p.mrp ? `<span class="pdp-mrp">${formatINR(p.mrp)}</span>` : ''}
        ${savePct ? `<span class="pdp-save">${savePct}% off</span>` : ''}
      </div>
      <div class="pdp-unit">Pack size: ${escapeHtmlPD(p.unit || '—')}</div>
      <p class="pdp-desc">${escapeHtmlPD(p.description || 'A traditional favourite from the Namita Ji kitchen, made fresh in small batches.')}</p>
      <div class="pdp-stock ${stockClass}">${stockText}</div>
      <div class="pdp-actions">
        <button class="btn btn-primary" id="pdpAddToCart" ${p.stock === 0 ? 'disabled' : ''}>Add to Cart</button>
        <button class="btn btn-maroon" id="pdpBuyNow" ${p.stock === 0 ? 'disabled' : ''}>Buy Now</button>
      </div>
    </div>
  `;

  document.getElementById('pdpAddToCart').onclick = () => Cart.add(p, 1);
  document.getElementById('pdpBuyNow').onclick = () => {
    Cart.add(p, 1);
    Cart.openDrawer();
  };
}

async function loadReviews(slug) {
  const section = document.getElementById('reviewsSection');
  section.hidden = false;
  try {
    const { reviews, count, average } = await api(`/products/${encodeURIComponent(slug)}/reviews`);

    const ratingRow = document.getElementById('pdpRatingRow');
    if (ratingRow) {
      ratingRow.innerHTML = count
        ? `<span class="stars">${starsHtml(average)}</span><span class="count">${average} out of 5 (${count} review${count === 1 ? '' : 's'})</span>`
        : `<span class="count">No ratings yet — be the first to review</span>`;
    }

    document.getElementById('reviewsSummary').innerHTML = `
      <div class="reviews-avg">
        <div class="num">${count ? average : '—'}</div>
        <div class="stars">${starsHtml(average)}</div>
        <div class="count">${count} review${count === 1 ? '' : 's'}</div>
      </div>
      <div style="color:var(--muted);font-size:0.9rem;">
        Reviews are from verified Namita Ji customers who created an account to share their experience.
      </div>
    `;

    const list = document.getElementById('reviewsList');
    if (reviews.length === 0) {
      list.innerHTML = '<p style="color:var(--muted);">No reviews yet for this product.</p>';
    } else {
      list.innerHTML = reviews
        .map(
          (r) => `
        <div class="review-card">
          <div class="rhead">
            <span class="rname">${escapeHtmlPD(r.name)}</span>
            <span class="rdate">${new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
          </div>
          <div class="rstars">${starsHtml(r.rating)}</div>
          <p>${escapeHtmlPD(r.comment)}</p>
        </div>`
        )
        .join('');
    }
  } catch (err) {
    document.getElementById('reviewsList').innerHTML = `<p style="color:var(--danger);">${escapeHtmlPD(err.message)}</p>`;
  }
}

function initStarInput() {
  const stars = document.querySelectorAll('#starInput span');
  stars.forEach((star) => {
    star.onclick = () => {
      selectedRating = Number(star.dataset.v);
      stars.forEach((s) => s.classList.toggle('filled', Number(s.dataset.v) <= selectedRating));
    };
  });
}

function initReviewForm() {
  document.getElementById('reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('reviewError');
    errorEl.textContent = '';

    if (!Auth.isLoggedIn()) {
      Auth.open('login', () => showToast('Now write your review!', 'success'));
      return;
    }
    if (!selectedRating) {
      errorEl.textContent = 'Please select a star rating';
      return;
    }

    const slug = new URLSearchParams(location.search).get('slug');
    const comment = document.getElementById('reviewComment').value.trim();
    const submitBtn = document.getElementById('reviewSubmit');
    submitBtn.disabled = true;
    try {
      await api(`/products/${encodeURIComponent(slug)}/reviews`, {
        method: 'POST',
        auth: true,
        body: { rating: selectedRating, comment }
      });
      showToast('Thanks for your review!', 'success');
      document.getElementById('reviewForm').reset();
      selectedRating = 0;
      document.querySelectorAll('#starInput span').forEach((s) => s.classList.remove('filled'));
      loadReviews(slug);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProduct();
  initStarInput();
  initReviewForm();
});
