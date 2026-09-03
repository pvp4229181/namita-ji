// Amazon-style account page: details, addresses, order history + refund requests.
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

const statusLabel = {
  created: 'Payment Pending',
  paid: 'Paid',
  failed: 'Payment Failed',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded'
};

function renderDetails(user) {
  document.getElementById('detailsBody').innerHTML = `
    <div class="field"><label>Name</label><input value="${escapeHtml(user.name)}" disabled /></div>
    <div class="field"><label>Email</label><input value="${escapeHtml(user.email)}" disabled /></div>
    <div class="field"><label>Phone</label><input value="${escapeHtml(user.phone || '—')}" disabled /></div>
    <div class="field"><label>Member Since</label><input value="${new Date(user.createdAt).toLocaleDateString('en-IN')}" disabled /></div>
  `;
}

function renderAddresses(user) {
  const list = document.getElementById('addressList');
  if (!user.addresses || user.addresses.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">No saved addresses yet.</p>';
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
      try {
        const data = await api(`/auth/address/${btn.dataset.id}`, { method: 'DELETE', auth: true });
        localStorage.setItem('nj_user', JSON.stringify(data.user));
        renderAddresses(data.user);
        showToast('Address removed', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });
}

async function loadOrders() {
  const wrap = document.getElementById('ordersList');
  try {
    const data = await api('/orders/my', { auth: true });
    if (!data.orders || data.orders.length === 0) {
      wrap.innerHTML = '<p style="color:var(--muted)">You have not placed any orders yet.</p>';
      return;
    }
    wrap.innerHTML = data.orders.map(renderOrderCard).join('');
    wrap.querySelectorAll('.refund-btn').forEach((btn) => {
      btn.onclick = () => requestRefund(btn.dataset.id, btn);
    });
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function renderOrderCard(o) {
  const itemsHtml = o.items
    .map((i) => `<div class="order-item-row"><span>${escapeHtml(i.name)} x ${i.quantity}</span><span>${formatINR(i.price * i.quantity)}</span></div>`)
    .join('');

  let refundSection = '';
  if (o.status === 'paid') {
    refundSection = `<button class="btn btn-sm btn-outline refund-btn" data-id="${o._id}" style="border-color:var(--maroon);color:var(--maroon);margin-top:10px;">Request Refund</button>`;
  } else if (o.status === 'refund_requested') {
    refundSection = `<div class="order-meta">Refund requested on ${new Date(o.refund.requestedAt).toLocaleDateString('en-IN')} — awaiting review.</div>`;
  } else if (o.status === 'refunded') {
    refundSection = `<div class="order-meta">Refunded on ${new Date(o.refund.processedAt).toLocaleDateString('en-IN')}.</div>`;
  }

  return `
    <div class="order-card">
      <div class="order-head">
        <div>
          <b>Order #${o._id.slice(-8).toUpperCase()}</b>
          <div class="order-meta">${new Date(o.createdAt).toLocaleString('en-IN')}</div>
        </div>
        <span class="order-status status-${o.status}">${statusLabel[o.status] || o.status}</span>
      </div>
      ${itemsHtml}
      <div class="order-item-row" style="font-weight:700;color:var(--maroon-dark);border-top:1px solid var(--cream-dark);padding-top:8px;margin-top:6px;">
        <span>Total Paid</span><span>${formatINR(o.amount)}</span>
      </div>
      ${refundSection}
    </div>`;
}

async function requestRefund(orderId, btn) {
  const reason = prompt('Please tell us the reason for the refund request:');
  if (reason === null) return;
  btn.disabled = true;
  try {
    await api(`/orders/${orderId}/refund-request`, { method: 'POST', auth: true, body: { reason } });
    showToast('Refund request submitted', 'success');
    loadOrders();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

function initTabs() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
      link.classList.add('active');
      document.getElementById(`tab-${link.dataset.tab}`).hidden = false;
    };
  });
  if (location.hash === '#orders') {
    document.querySelector('[data-tab="orders"]').click();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) {
    document.getElementById('loginGate').hidden = false;
    document.getElementById('gateLoginBtn').onclick = () => Auth.open('login', () => location.reload());
    return;
  }

  document.getElementById('accountWrap').hidden = false;
  initTabs();

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

  try {
    const data = await api('/auth/me', { auth: true });
    localStorage.setItem('nj_user', JSON.stringify(data.user));
    renderDetails(data.user);
    renderAddresses(data.user);
  } catch (err) {
    Auth.logout();
    return;
  }

  loadOrders();
});
