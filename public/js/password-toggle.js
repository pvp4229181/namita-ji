// Adds a Show/Hide toggle to every password input on the page (login, signup,
// change-password). Works on inputs present at load and on ones revealed
// later (e.g. the signup fields, which start hidden).
(function () {
  function addToggle(input) {
    if (input.dataset.pwToggle) return;
    input.dataset.pwToggle = '1';

    const wrap = document.createElement('div');
    wrap.className = 'pw-field-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle-btn';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.onclick = () => {
      const nowShowing = input.type === 'password';
      input.type = nowShowing ? 'text' : 'password';
      btn.textContent = nowShowing ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', nowShowing ? 'Hide password' : 'Show password');
    };
    wrap.appendChild(btn);
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(addToggle);
  }

  // Password fields (including ones toggled via the `hidden` attribute, like
  // the signup confirm-password field) already exist in the DOM at load —
  // no need to rescan later.
  document.addEventListener('DOMContentLoaded', scan);
})();
