const API_BASE = '/api';
function token() { return localStorage.getItem('nj_admin_token'); }
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers.Authorization = 'Bearer ' + token();
  const res = await fetch(API_BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (data.user.role !== 'admin') { errEl.textContent = 'This account is not an admin.'; return; }
    localStorage.setItem('nj_admin_token', data.token);
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem('nj_admin_token');
  document.getElementById('dashboard').hidden = true;
  document.getElementById('loginScreen').hidden = false;
}

function dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }

function verificationBadge(v) {
  // Accounts created before this feature have no `verification` object at all.
  if (!v) return '<span style="color:var(--muted)">—</span>';
  const emailOk = !!v.email?.verified;
  const phoneOk = !!v.phone?.verified;
  if (emailOk && phoneOk) return '<span style="color:var(--success)">Verified</span>';
  const pending = [!emailOk && 'email', !phoneOk && 'phone'].filter(Boolean).join(' + ');
  return `<span style="color:var(--danger)">Pending (${pending})</span>`;
}

function welcomeEmailBadge(w) {
  const status = w?.status || 'pending';
  if (status === 'sent') return `<span style="color:var(--success)">Sent</span><br/><span style="color:var(--muted);font-size:0.7rem">${dt(w.sentAt)}</span>`;
  if (status === 'failed') return `<span style="color:var(--danger)">Failed</span><br/><span style="color:var(--muted);font-size:0.7rem" title="${esc(w.error || '')}">${esc((w.error || '').slice(0, 40))}</span>`;
  return '<span style="color:var(--muted)">Pending</span>';
}

async function loadStats() {
  const s = await api('/admin/summary');
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><b>${inr(s.netRevenue)}</b><span>Net Revenue (after refunds)</span></div>
    <div class="stat-card"><b>${inr(s.orderRevenue)}</b><span>Order Revenue · ${s.paidOrderCount} paid</span></div>
    <div class="stat-card"><b>${inr(s.refundedTotal)}</b><span>Refunded · ${s.refundedCount} orders</span></div>
    <div class="stat-card"><b>${s.orderCount}</b><span>Orders Created (incl. unpaid)</span></div>
    <div class="stat-card"><b>${s.userCount}</b><span>Registered Customers</span></div>
    <div class="stat-card" ${s.pendingRefunds ? 'style="border-left:4px solid var(--danger)"' : ''}><b>${s.pendingRefunds}</b><span>Refunds Awaiting Review</span></div>
  `;
}

// Refund actions are wired with addEventListener rather than inline onclick so the
// button stays disabled while the request is in flight — a double-click here would
// otherwise be an attempt to refund the same payment twice.
function wireRefundButtons(root) {
  root.querySelectorAll('[data-refund]').forEach(btn => {
    btn.onclick = () => approveRefund(btn.dataset.refund, btn);
  });
  root.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = () => rejectRefund(btn.dataset.reject, btn);
  });
}

async function loadTab(tab) {
  const content = document.getElementById('tabContent');
  content.innerHTML = '<p>Loading…</p>';
  try {
    if (tab === 'orders' || tab === 'refunds') {
      const { orders } = await api(tab === 'refunds' ? '/admin/orders?status=refund_requested' : '/admin/orders');
      if (!orders.length) { content.innerHTML = `<p style="color:var(--muted)">No ${tab === 'refunds' ? 'refund requests' : 'orders'} yet.</p>`; return; }
      content.innerHTML = `
        <table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th>${tab === 'refunds' ? '<th>Action</th>' : ''}</tr></thead>
        <tbody>${orders.map(o => `
          <tr>
            <td>#${o._id.slice(-8).toUpperCase()}
              ${o.stockWarning ? `<br/><span style="color:var(--danger);font-size:0.7rem">⚠ ${esc(o.stockWarning)}</span>` : ''}</td>
            <td>${esc(o.user?.name)}<br/><span style="color:var(--muted)">${esc(o.user?.email)}</span>
              ${o.address?.phone ? `<br/><span style="color:var(--muted)">${esc(o.address.phone)}</span>` : ''}</td>
            <td>${o.items.map(i => esc(i.name) + ' ×' + i.quantity).join('<br/>')}</td>
            <td><b>${inr(o.amount)}</b>${o.refund?.amount ? `<br/><span style="color:var(--danger);font-size:0.72rem">−${inr(o.refund.amount)} refunded</span>` : ''}</td>
            <td style="font-size:0.72rem">
              ${o.paymentMethod ? esc(o.paymentMethod.toUpperCase()) + '<br/>' : ''}
              ${o.razorpayPaymentId ? esc(o.razorpayPaymentId) : '<span style="color:var(--muted)">not paid</span>'}
              ${o.capturedAtRazorpay === false && o.status === 'paid' ? '<br/><span style="color:#a06b00">authorized, not captured</span>' : ''}</td>
            <td><span class="badge b-${o.status}">${o.status.replace('_',' ')}</span></td>
            <td>${dt(o.createdAt)}${o.paidAt ? `<br/><span style="color:var(--muted);font-size:0.72rem">paid ${dt(o.paidAt)}</span>` : ''}</td>
            ${tab === 'refunds' ? `<td class="actions">
              <button class="btn-approve" data-refund="${o._id}">Refund ${inr(o.amount)}</button>
              <button class="btn-reject" data-reject="${o._id}">Reject</button>
              ${o.refund?.reason ? `<div style="color:var(--muted);font-size:0.7rem;margin-top:6px;max-width:200px">${esc(o.refund.reason)}</div>` : ''}
            </td>` : ''}
          </tr>`).join('')}</tbody></table>`;
      wireRefundButtons(content);
    } else if (tab === 'users') {
      const { users } = await api('/admin/users');
      if (!users.length) { content.innerHTML = '<p style="color:var(--muted)">No customers yet.</p>'; return; }
      // Biggest spenders first — this is the "who actually paid" view.
      users.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
      content.innerHTML = `
        <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Last Order</th><th>Joined</th><th>Welcome Email</th><th>Verified</th></tr></thead>
        <tbody>${users.map(u => `
          <tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone) || '—'}</td>
          <td>${u.orderCount || 0}</td>
          <td><b style="color:${u.totalSpent ? 'var(--success)' : 'var(--muted)'}">${inr(u.totalSpent || 0)}</b></td>
          <td>${dt(u.lastOrderAt)}</td>
          <td>${new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${welcomeEmailBadge(u.welcomeEmail)}</td>
          <td>${verificationBadge(u.verification)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'logs') {
      const { logs } = await api('/admin/payment-logs');
      const alarming = ['verify_failure','amount_mismatch','webhook_signature_invalid','refund_failed','stock_shortfall','webhook_error'];
      content.innerHTML = `
        <p style="color:var(--muted);font-size:0.8rem;margin-top:0">Immutable audit trail. Rows highlighted in red are the ones worth investigating.</p>
        <table><thead><tr><th>Event</th><th>Ref</th><th>Amount</th><th>Razorpay Order</th><th>Payment ID</th><th>Detail</th><th>Time</th></tr></thead>
        <tbody>${logs.map(l => `
          <tr${alarming.includes(l.type) ? ' style="background:#fdf0ee"' : ''}>
            <td><b>${esc(l.type)}</b></td><td>${esc(l.refModel) || '—'}</td>
            <td>${l.amount ? inr(l.amount) : '—'}</td>
            <td style="font-size:0.7rem">${esc(l.razorpayOrderId) || '—'}</td>
            <td style="font-size:0.7rem">${esc(l.razorpayPaymentId) || '—'}</td>
            <td style="font-size:0.72rem;max-width:260px;color:var(--muted)">${esc(l.meta ? (l.meta.reason || l.meta.error || l.meta.event || JSON.stringify(l.meta)) : '')}</td>
            <td>${dt(l.createdAt)}</td></tr>`).join('')}</tbody></table>`;
    }
  } catch (err) {
    content.innerHTML = `<p style="color:var(--danger)">Could not load: ${esc(err.message)}</p>`;
  }
}

async function approveRefund(orderId, btn) {
  if (!confirm('Process this refund through Razorpay?\n\nThis moves real money back to the customer and cannot be undone.')) return;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Refunding…';
  try {
    await api(`/admin/orders/${orderId}/refund`, { method: 'POST', body: {} });
    alert('Refund processed. It typically reaches the customer in 5–7 working days.');
    loadTab('refunds');
    loadStats();
  } catch (err) {
    alert('Refund failed: ' + err.message + '\n\nCheck the Razorpay dashboard before retrying — the refund may have gone through.');
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function rejectRefund(orderId, btn) {
  const note = prompt('Reason for rejecting this refund request:');
  if (note === null) return;
  btn.disabled = true;
  try {
    await api(`/admin/orders/${orderId}/reject-refund`, { method: 'POST', body: { note } });
    loadTab('refunds');
    loadStats();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}

function showDashboard() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('dashboard').hidden = false;
  loadStats();
  loadTab('orders');
}

document.getElementById('loginBtn').onclick = login;
document.getElementById('logoutBtn').onclick = logout;
['loginEmail', 'loginPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
});
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadTab(btn.dataset.tab);
  };
});

if (token()) {
  api('/admin/summary').then(showDashboard).catch(logout);
}
