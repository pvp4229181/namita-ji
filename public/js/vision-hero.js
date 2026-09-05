// Adds and rotates the Vision hero backgrounds without blocking the initial page content.
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.vision-hero');
  if (!hero) return;

  const sources = [
    '/images/vision-hero-kitchen.jpg',
    '/images/vision-hero-thali.jpg',
    '/images/vision-hero-courtyard.jpg'
  ];
  const background = document.createElement('div');
  background.className = 'vision-hero-bg';
  background.setAttribute('aria-hidden', 'true');
  const slides = sources.map((src, index) => {
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.decoding = 'async';
    if (index === 0) image.className = 'active';
    background.appendChild(image);
    return image;
  });
  hero.prepend(background);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = 0;
  window.setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 1500);
});
