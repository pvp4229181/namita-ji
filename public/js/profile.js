// Amazon-style account page: details, addresses, order history,
// refund requests and password changes.
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

const statusLabel = {
  created: 'Payment Pending',
  paid: 'Paid',
  failed: 'Payment Failed',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded'
};

let allOrders = [];

/* ---------------- Account details ---------------- */

function renderDetails(user) {
  document.getElementById('pfName').value = user.name || '';
  document.getElementById('pfEmail').value = user.email || '';
  document.getElementById('pfPhone').value = user.phone || '';
  document.getElementById('greetName').textContent = (user.name || '').split(' ')[0] || 'there';
  document.getElementById('statSince').textContent = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '—';
}

async function saveDetails(e) {
  e.preventDefault();
  const errorEl = document.getElementById('detailsError');
  const btn = document.getElementById('detailsSubmit');
  errorEl.textContent = '';
  btn.disabled = true;
  try {
    const data = await api('/auth/me', {
      method: 'PUT',
      auth: true,
      body: {
        name: document.getElementById('pfName').value.trim(),
        phone: document.getElementById('pfPhone').value.trim()
      }
    });
    localStorage.setItem('nj_user', JSON.stringify(data.user));
    renderDetails(data.user);
    Auth.renderProfileMenu();
    showToast('Profile updated', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function changePassword(e) {
  e.preventDefault();
  const errorEl = document.getElementById('pwError');
  const btn = document.getElementById('pwSubmit');
  errorEl.textContent = '';

  const current = document.getElementById('pwCurrent').value;
  const next = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;

  if (next !== confirm) {
    errorEl.textContent = 'The two new passwords do not match';
    return;
  }

  btn.disabled = true;
  try {
    // The server invalidates every older session, so it hands back a fresh token
    // for this device — store it or the next request would 401.
    const data = await api('/auth/change-password', {
      method: 'POST',
      auth: true,
      body: { currentPassword: current, newPassword: next }
    });
    Auth.persist(data.token, data.user);
    e.target.reset();
    showToast('Password updated. Other devices have been signed out.', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Addresses ---------------- */

function renderAddresses(user) {
  const list = document.getElementById('addressList');
  if (!user.addresses || user.addresses.length === 0) {
    list.innerHTML = '<p class="empty-note">No saved addresses yet.</p>';
    return;
  }
  list.innerHTML = user.addresses
    .map(
      (a) => `
    <div class="addr-card">
      <b>${escapeHtml(a.label || 'Address')}</b>
      <p style="margin:6px 0;color:var(--muted);font-size:0.88rem;">
        ${escapeHtml(a.line1)}${a.line2 ? ', ' + escapeHtml(a.line2) : ''}, ${escapeHtml(a.city)}, ${escapeHtml(a.state)} - ${escapeHtml(a.pincode)}<br/>
        Phone: ${escapeHtml(a.phone)}
      </p>
      <button class="btn btn-sm btn-danger delete-addr" data-id="${a._id}">Remove</button>
    </div>`
    )
    .join('');

  list.querySelectorAll('.delete-addr').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const data = await api(`/auth/address/${btn.dataset.id}`, { method: 'DELETE', auth: true });
        localStorage.setItem('nj_user', JSON.stringify(data.user));
        renderAddresses(data.user);
        showToast('Address removed', 'success');
      } catch (err) {
        btn.disabled = false;
        showToast(err.message, 'error');
      }
    };
  });
}

/* ---------------- Orders ---------------- */

async function loadOrders() {
  const wrap = document.getElementById('ordersList');
  try {
    const data = await api('/orders/my', { auth: true });
    allOrders = data.orders || [];

    // "Total spent" counts money actually kept — a refunded order is money returned.
    const spent = allOrders
      .filter((o) => ['paid', 'refund_requested'].includes(o.status))
      .reduce((s, o) => s + o.amount, 0);
    document.getElementById('statSpent').textContent = formatINR(spent);
    document.getElementById('statOrders').textContent = allOrders.filter((o) => o.status !== 'created').length;

    if (allOrders.length === 0) {
      wrap.innerHTML =
        '<p class="empty-note">You have not placed any orders yet. <a href="/shop.html" style="color:var(--maroon);font-weight:600;">Browse the shop →</a></p>';
      return;
    }
    wrap.innerHTML = allOrders.map(renderOrderCard).join('');
    wrap.querySelectorAll('.refund-btn').forEach((btn) => {
      btn.onclick = () => openRefundModal(btn.dataset.id);
    });
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function renderOrderCard(o) {
  const itemsHtml = o.items
    .map(
      (i) =>
        `<div class="order-item-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><span>${formatINR(i.price * i.quantity)}</span></div>`
    )
    .join('');

  let refundSection = '';
  if (o.status === 'paid') {
    refundSection = `<div class="inline-actions"><button class="btn btn-sm btn-outline refund-btn" data-id="${o._id}" style="border-color:var(--maroon);color:var(--maroon);">Request Refund</button></div>`;
  } else if (o.status === 'refund_requested') {
    refundSection = `<div class="order-meta">Refund requested on ${formatDateTime(o.refund?.requestedAt)} — our team is reviewing it.${
      o.refund?.reason ? ` <br/>Reason: ${escapeHtml(o.refund.reason)}` : ''
    }</div>`;
  } else if (o.status === 'refunded') {
    refundSection = `<div class="order-meta">Refunded ${formatINR(o.refund?.amount || o.amount)} on ${formatDateTime(
      o.refund?.processedAt
    )}. It usually reaches your account in 5–7 working days.</div>`;
  } else if (o.status === 'created') {
    refundSection = `<div class="order-meta">This order was never paid for, so nothing was charged.</div>`;
  }

  const paymentMeta =
    o.status === 'created' || o.status === 'failed'
      ? ''
      : `<div class="order-payment-meta">
           <span>Paid on ${formatDateTime(o.paidAt)}</span>
           ${o.paymentMethod ? `<span>Method: ${escapeHtml(o.paymentMethod.toUpperCase())}</span>` : ''}
           ${o.razorpayPaymentId ? `<span>Payment ID: <code>${escapeHtml(o.razorpayPaymentId)}</code></span>` : ''}
         </div>`;

  return `
    <div class="order-card">
      <div class="order-head">
        <div>
          <b>Order #${o._id.slice(-8).toUpperCase()}</b>
          <div class="order-meta">Placed ${formatDateTime(o.createdAt)}</div>
        </div>
        <span class="order-status status-${o.status}">${statusLabel[o.status] || o.status}</span>
      </div>
      ${itemsHtml}
      <div class="order-item-row"><span>Shipping</span><span>${o.shipping ? formatINR(o.shipping) : 'FREE'}</span></div>
      <div class="order-item-row" style="font-weight:700;color:var(--maroon-dark);border-top:1px solid var(--cream-dark);padding-top:8px;margin-top:6px;">
        <span>${o.status === 'paid' || o.status === 'refund_requested' ? 'Total Paid' : 'Order Total'}</span><span>${formatINR(o.amount)}</span>
      </div>
      ${paymentMeta}
      ${refundSection}
    </div>`;
}

/* ---------------- Refund requests ---------------- */

let refundOrderId = null;

function openRefundModal(orderId) {
  refundOrderId = orderId;
  const order = allOrders.find((o) => o._id === orderId);
  document.getElementById('refundOrderLabel').textContent = order
    ? `Order #${order._id.slice(-8).toUpperCase()} — ${formatINR(order.amount)}`
    : 'Tell us what went wrong.';
  document.getElementById('refundError').textContent = '';
  document.getElementById('refundBackdrop').classList.add('open');
}

function closeRefundModal() {
  document.getElementById('refundBackdrop').classList.remove('open');
  refundOrderId = null;
}

async function submitRefund(e) {
  e.preventDefault();
  if (!refundOrderId) return;
  const errorEl = document.getElementById('refundError');
  const btn = document.getElementById('refundSubmit');
  errorEl.textContent = '';
  btn.disabled = true;

  const reason = document.getElementById('refundReason').value;
  const note = document.getElementById('refundNote').value.trim();

  try {
    await api(`/orders/${refundOrderId}/refund-request`, {
      method: 'POST',
      auth: true,
      body: { reason: note ? `${reason} — ${note}` : reason }
    });
    closeRefundModal();
    document.getElementById('refundForm').reset();
    showToast('Refund request submitted. We will review it shortly.', 'success');
    loadOrders();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Tabs ---------------- */

function initTabs() {
  const show = (tab) => {
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== `tab-${tab}`));
  };

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      history.replaceState(null, '', `#${link.dataset.tab}`);
      show(link.dataset.tab);
    };
  });

  const fromHash = location.hash.replace('#', '');
  if (fromHash && document.getElementById(`tab-${fromHash}`)) show(fromHash);
}

/* ---------------- Boot ---------------- */

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) {
    document.getElementById('loginGate').hidden = false;
    document.getElementById('gateLoginBtn').onclick = () => Auth.open('login', () => location.reload());
    return;
  }

  let user;
  try {
    ({ user } = await api('/auth/me', { auth: true }));
  } catch (err) {
    // Session expired — show the login gate rather than a broken page.
    document.getElementById('loginGate').hidden = false;
    document.getElementById('gateLoginBtn').onclick = () => Auth.open('login', () => location.reload());
    return;
  }

  localStorage.setItem('nj_user', JSON.stringify(user));
  document.getElementById('accountHead').hidden = false;
  document.getElementById('accountWrap').hidden = false;

  initTabs();
  renderDetails(user);
  renderAddresses(user);

  document.getElementById('detailsForm').addEventListener('submit', saveDetails);
  document.getElementById('passwordForm').addEventListener('submit', changePassword);
  document.getElementById('refundForm').addEventListener('submit', submitRefund);
  document.getElementById('refundClose').onclick = closeRefundModal;
  document.getElementById('refundBackdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('refundBackdrop')) closeRefundModal();
  });

  document.getElementById('addAddressForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = {
        label: document.getElementById('newAddrLabel').value.trim() || 'Address',
        line1: document.getElementById('newAddrLine1').value.trim(),
        line2: document.getElementById('newAddrLine2').value.trim(),
        city: document.getElementById('newAddrCity').value.trim(),
        state: document.getElementById('newAddrState').value.trim(),
        pincode: document.getElementById('newAddrPincode').value.trim(),
        phone: document.getElementById('newAddrPhone').value.trim()
      };
      const data = await api('/auth/address', { method: 'POST', auth: true, body });
      localStorage.setItem('nj_user', JSON.stringify(data.user));
      renderAddresses(data.user);
      e.target.reset();
      showToast('Address added', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadOrders();
});
