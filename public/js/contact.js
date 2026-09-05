  document.getElementById('contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    showToast("Thanks! We'll get back to you soon.", 'success');
    e.target.reset();
  });
