// Handles login/signup modal + current-user state + profile dropdown.
const Auth = (() => {
  let currentUser = null;
  try {
    const cached = localStorage.getItem('nj_user');
    if (cached) currentUser = JSON.parse(cached);
  } catch (e) {}

  let mode = 'login'; // or 'signup'
  let onSuccessCallback = null;

  const backdrop = () => document.getElementById('authBackdrop');
  const form = () => document.getElementById('authForm');

  function setMode(next) {
    mode = next;
    const isSignup = mode === 'signup';
    document.getElementById('authTitle').textContent = isSignup ? 'Create Account' : 'Welcome Back';
    document.getElementById('authSub').textContent = isSignup ? 'Sign up to start ordering' : 'Log in to continue to checkout';
    document.getElementById('nameField').hidden = !isSignup;
    document.getElementById('phoneField').hidden = !isSignup;
    document.getElementById('authSubmit').textContent = isSignup ? 'Sign Up' : 'Log In';
    document.getElementById('authToggleText').textContent = isSignup ? 'Already have an account?' : 'New here?';
    document.getElementById('authToggleBtn').textContent = isSignup ? 'Log in' : 'Create an account';
    document.getElementById('authError').textContent = '';
    form().reset();
  }

  function open(next = 'login', onSuccess = null) {
    setMode(next);
    onSuccessCallback = onSuccess;
    backdrop().classList.add('open');
  }

  function close() {
    backdrop().classList.remove('open');
  }

  function isLoggedIn() {
    return !!currentUser && !!authToken();
  }

  function getUser() {
    return currentUser;
  }

  function persist(token, user) {
    localStorage.setItem('nj_token', token);
    localStorage.setItem('nj_user', JSON.stringify(user));
    currentUser = user;
  }

  function logout() {
    clearSession();
    currentUser = null;
    renderProfileMenu();
    showToast('Logged out', 'success');
    if (location.pathname !== '/') location.href = '/';
  }

  // The cached user in localStorage can outlive the JWT. Re-checking it against the
  // server on load means an expired session shows as logged out instead of failing
  // halfway through a checkout.
  async function refreshSession() {
    if (!authToken()) return;
    try {
      const { user } = await api('/auth/me', { auth: true });
      currentUser = user;
      localStorage.setItem('nj_user', JSON.stringify(user));
    } catch (err) {
      if (err.status === 401) currentUser = null;
    }
    renderProfileMenu();
  }

  function renderProfileMenu() {
    const menu = document.getElementById('profileMenu');
    if (!menu) return;
    if (isLoggedIn()) {
      const isAdmin = currentUser.role === 'admin';
      menu.innerHTML = `
        <div class="pm-head"><b>${escapeHtml(currentUser.name)}</b><span>${escapeHtml(currentUser.email)}</span></div>
        <a href="/profile.html">My Account</a>
        <a href="/profile.html#orders">My Orders</a>
        ${isAdmin ? '<a href="/admin">Admin Dashboard</a>' : ''}
        <button id="logoutBtn">Log Out</button>
      `;
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) logoutBtn.onclick = logout;
    } else {
      menu.innerHTML = `
        <button id="pmLogin">Log In</button>
        <button id="pmSignup">Sign Up</button>
      `;
      document.getElementById('pmLogin').onclick = () => { toggleProfileMenu(false); open('login'); };
      document.getElementById('pmSignup').onclick = () => { toggleProfileMenu(false); open('signup'); };
    }
  }

  function toggleProfileMenu(force) {
    const menu = document.getElementById('profileMenu');
    if (!menu) return;
    const open_ = typeof force === 'boolean' ? force : !menu.classList.contains('open');
    menu.classList.toggle('open', open_);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function init() {
    document.getElementById('authClose').onclick = close;
    backdrop().addEventListener('click', (e) => { if (e.target === backdrop()) close(); });
    document.getElementById('authToggleBtn').onclick = () => setMode(mode === 'login' ? 'signup' : 'login');

    form().addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('authError');
      errorEl.textContent = '';
      const submitBtn = document.getElementById('authSubmit');
      submitBtn.disabled = true;
      try {
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        let data;
        if (mode === 'signup') {
          const name = document.getElementById('authName').value.trim();
          const phone = document.getElementById('authPhone').value.trim();
          if (!name) throw new Error('Please enter your name');
          data = await api('/auth/signup', { method: 'POST', body: { name, email, password, phone } });
        } else {
          data = await api('/auth/login', { method: 'POST', body: { email, password } });
        }
        persist(data.token, data.user);
        renderProfileMenu();
        close();
        showToast(mode === 'signup' ? 'Account created!' : 'Welcome back!', 'success');
        if (onSuccessCallback) onSuccessCallback();
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('profileBtn').onclick = (e) => { e.stopPropagation(); toggleProfileMenu(); };
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('profileWrap');
      if (wrap && !wrap.contains(e.target)) toggleProfileMenu(false);
    });

    renderProfileMenu();
    refreshSession();
  }

  return { init, open, close, isLoggedIn, getUser, logout, renderProfileMenu, refreshSession, persist };
})();

document.addEventListener('DOMContentLoaded', Auth.init);
