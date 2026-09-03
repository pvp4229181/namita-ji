// Cross-fades the hero background photos every 1.5 seconds.
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('heroBg');
  if (!bg) return;
  const slides = Array.from(bg.querySelectorAll('img'));
  if (slides.length < 2) return;

  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 1500);
});
