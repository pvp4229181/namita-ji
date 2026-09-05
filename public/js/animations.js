// Site-wide motion: scroll reveals, header shrink, ripples, cart pop, count-up, scroll-to-top.
// Auto-applies to common selectors so no per-page markup changes are needed.

(function scrollReveal() {
  const selectors = [
    '.feature-row', '.cat-card', '.t-card', '.faq-item', '.contact-card',
    '.reviews-summary', '.review-form', '.review-card', '.stat', '.about-grid > *'
  ];
  const targets = document.querySelectorAll(selectors.join(','));
  targets.forEach((el, i) => {
    if (el.closest('.hero')) return; // hero has its own load-in animation
    el.classList.add('reveal');
    el.style.transitionDelay = `${(i % 6) * 70}ms`;
  });

  // Product/bestseller grids render async, so observe their containers and tag children when they appear.
  ['#productGrid', '#bestsellerGrid'].forEach((sel) => {
    const grid = document.querySelector(sel);
    if (!grid) return;
    const mo = new MutationObserver(() => {
      Array.from(grid.children).forEach((el, i) => {
        if (el.classList.contains('product-card')) {
          el.classList.add('reveal-scale');
          el.style.transitionDelay = `${(i % 6) * 60}ms`;
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in-view')));
        }
      });
    });
    mo.observe(grid, { childList: true });
  });

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => io.observe(el));
})();

// Header shrink + shadow on scroll.
(function headerScroll() {
  const header = document.querySelector('header.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

// Ripple effect on buttons/pills.
(function ripple() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.btn, .filter-chip, .icon-btn');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'btn-ripple';
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(span);
    setTimeout(() => span.remove(), 650);
  });
})();

// Scroll-to-top button (auto-injected).
(function scrollTop() {
  const btn = document.createElement('button');
  btn.id = 'scrollTopBtn';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '↑';
  document.body.appendChild(btn);
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  window.addEventListener(
    'scroll',
    () => btn.classList.toggle('visible', window.scrollY > 500),
    { passive: true }
  );
})();

// Count-up animation for stat numbers (e.g. "15+", "50,000+", "100%").
(function countUp() {
  const nodes = document.querySelectorAll('.stat b, .reviews-avg .num');
  if (!nodes.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const raw = el.textContent.trim();
        const match = raw.match(/[\d,.]+/);
        if (!match) return;
        const numStr = match[0];
        const target = parseFloat(numStr.replace(/,/g, ''));
        if (!isFinite(target) || target <= 0) return;
        const suffix = raw.slice(raw.indexOf(numStr) + numStr.length);
        const prefix = raw.slice(0, raw.indexOf(numStr));
        const duration = 1100;
        const start = performance.now();
        const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
        function tick(now) {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const val = target * eased;
          const formatted = decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-IN');
          el.textContent = `${prefix}${formatted}${suffix}`;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.4 }
  );
  nodes.forEach((el) => io.observe(el));
})();

// Cart badge pop + cart icon jiggle whenever the badge count changes.
(function cartFeedback() {
  const badge = document.getElementById('cartBadge');
  const cartBtn = document.getElementById('cartBtn');
  if (!badge || !cartBtn) return;
  let lastText = badge.textContent;
  const mo = new MutationObserver(() => {
    if (badge.textContent !== lastText && !badge.hidden) {
      lastText = badge.textContent;
      badge.classList.remove('pop');
      cartBtn.classList.remove('jiggle');
      void badge.offsetWidth; // restart animation
      badge.classList.add('pop');
      cartBtn.classList.add('jiggle');
    }
  });
  mo.observe(badge, { childList: true, characterData: true, subtree: true });
})();
