// Handles login/signup modal + current-user state + profile dropdown.
const Auth = (() => {
  let currentUser = null;
  try {
    const cached = localStorage.getItem('nj_user');
    if (cached) currentUser = JSON.parse(cached);
  } catch (e) {}

  let mode = 'login'; // or 'signup'
  let onSuccessCallback = null;
  let pendingVerification = null; // { userId, email, phone }

  const backdrop = () => document.getElementById('authBackdrop');
  const form = () => document.getElementById('authForm');

  function setMode(next) {
    mode = next;
    const isSignup = mode === 'signup';
    document.getElementById('authTitle').textContent = isSignup ? 'Create Account' : 'Welcome Back';
    document.getElementById('authSub').textContent = isSignup ? 'Sign up to start ordering' : 'Log in to continue to checkout';
    document.getElementById('nameField').hidden = !isSignup;
    document.getElementById('phoneField').hidden = !isSignup;
    document.getElementById('confirmPasswordField').hidden = !isSignup;
    document.getElementById('authSubmit').textContent = isSignup ? 'Sign Up' : 'Log In';
    document.getElementById('authToggleText').textContent = isSignup ? 'Already have an account?' : 'New here?';
    document.getElementById('authToggleBtn').textContent = isSignup ? 'Log in' : 'Create an account';
    document.getElementById('authError').textContent = '';
    form().reset();
    hideVerifyStep();
  }

  function open(next = 'login', onSuccess = null) {
    setMode(next);
    onSuccessCallback = onSuccess;
    backdrop().classList.add('open');
  }

  // The verify-code screen isn't in any page's HTML — built once here and
  // toggled alongside the login/signup form, so no page template needed it.
  function ensureVerifyStep() {
    if (document.getElementById('authVerifyStep')) return;
    const container = document.createElement('div');
    container.id = 'authVerifyStep';
    container.hidden = true;
    container.innerHTML = `
      <div class="field">
        <label>Email Code</label>
        <input type="text" id="verifyEmailCode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" />
      </div>
      <button type="button" class="link-btn" id="resendEmailCode">Resend email code</button>
      <div class="field" style="margin-top:10px">
        <label>Phone Code</label>
        <input type="text" id="verifyPhoneCode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" />
      </div>
      <button type="button" class="link-btn" id="resendPhoneCode">Resend phone code</button>
      <div class="form-error" id="verifyError"></div>
      <button type="button" class="btn btn-primary btn-block" id="verifySubmit">Verify & Continue</button>
    `;
    form().parentNode.insertBefore(container, form().nextSibling);

    document.getElementById('verifySubmit').onclick = onVerifySubmit;
    document.getElementById('resendEmailCode').onclick = () => onResendCode('email');
    document.getElementById('resendPhoneCode').onclick = () => onResendCode('phone');
  }

  function showVerifyStep(info) {
    pendingVerification = { userId: info.userId, email: info.email, phone: info.phone };
    ensureVerifyStep();
    document.getElementById('authTitle').textContent = 'Verify Your Account';
    document.getElementById('authSub').textContent = `Enter the 4-digit codes sent to ${info.email} and ${info.phone}`;
    document.getElementById('authError').textContent = '';
    document.getElementById('verifyError').textContent = '';
    form().hidden = true;
    const toggle = document.querySelector('#authBackdrop .form-toggle');
    if (toggle) toggle.hidden = true;
    document.getElementById('authVerifyStep').hidden = false;
    backdrop().classList.add('open');
  }

  function hideVerifyStep() {
    const step = document.getElementById('authVerifyStep');
    if (step) step.hidden = true;
    form().hidden = false;
    const toggle = document.querySelector('#authBackdrop .form-toggle');
    if (toggle) toggle.hidden = false;
  }

  async function onVerifySubmit() {
    const errorEl = document.getElementById('verifyError');
    errorEl.textContent = '';
    const btn = document.getElementById('verifySubmit');
    btn.disabled = true;
    try {
      const emailCode = document.getElementById('verifyEmailCode').value.trim();
      const phoneCode = document.getElementById('verifyPhoneCode').value.trim();
      if (!/^\d{4}$/.test(emailCode) || !/^\d{4}$/.test(phoneCode)) {
        throw new Error('Enter both 4-digit codes');
      }
      const data = await api('/auth/verify-signup', {
        method: 'POST',
        body: { userId: pendingVerification.userId, emailCode, phoneCode }
      });
      persist(data.token, data.user);
      renderProfileMenu();
      hideVerifyStep();
      close();
      showToast('Account verified!', 'success');
      if (onSuccessCallback) onSuccessCallback();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function onResendCode(channel) {
    try {
      await api('/auth/resend-code', { method: 'POST', body: { userId: pendingVerification.userId, channel } });
      showToast(`New code sent to your ${channel}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // A login blocked on verification means the original codes may be long
  // expired — issue a fresh pair immediately instead of making the user
  // press "Resend" before they can do anything.
  async function handleBlockedLogin(info) {
    try {
      await Promise.all([
        api('/auth/resend-code', { method: 'POST', body: { userId: info.userId, channel: 'email' } }),
        api('/auth/resend-code', { method: 'POST', body: { userId: info.userId, channel: 'phone' } })
      ]);
    } catch (e) { /* best effort — the verify screen still lets them retry */ }
    showVerifyStep(info);
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
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address');
        if (mode === 'signup') {
          const name = document.getElementById('authName').value.trim();
          const phone = document.getElementById('authPhone').value.trim();
          const confirmPassword = document.getElementById('authConfirmPassword').value;
          if (!name) throw new Error('Please enter your name');
          if (!phone) throw new Error('Please enter your phone number');
          if (password !== confirmPassword) throw new Error('Passwords do not match');
          const data = await api('/auth/signup', { method: 'POST', body: { name, email, password, phone } });
          showVerifyStep(data);
        } else {
          const data = await api('/auth/login', { method: 'POST', body: { email, password } });
          persist(data.token, data.user);
          renderProfileMenu();
          close();
          showToast('Welcome back!', 'success');
          if (onSuccessCallback) onSuccessCallback();
        }
      } catch (err) {
        if (err.data?.requiresVerification) {
          await handleBlockedLogin(err.data);
        } else {
          errorEl.textContent = err.message;
        }
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
