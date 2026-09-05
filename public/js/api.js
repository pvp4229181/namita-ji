// Thin fetch wrapper shared by all pages.
const API_BASE = '/api';

function authToken() {
  return localStorage.getItem('nj_token');
}

function clearSession() {
  localStorage.removeItem('nj_token');
  localStorage.removeItem('nj_user');
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = authToken();
  if (token && auth) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw new Error('Network problem — please check your connection and try again.');
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }

  // An expired or revoked session shouldn't leave a stale "logged in" UI behind.
  if (res.status === 401 && auth) {
    clearSession();
    if (typeof Auth !== 'undefined' && Auth.renderProfileMenu) Auth.renderProfileMenu();
  }

  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3500);
}

function formatINR(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
