document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());

document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburgerBtn');
  const nav = document.getElementById('mainNav');
  if (hamburger && nav) {
    hamburger.onclick = () => nav.classList.toggle('open');
    nav.querySelectorAll('a').forEach((a) => (a.onclick = () => nav.classList.remove('open')));
  }
});
