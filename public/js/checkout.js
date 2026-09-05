// Cart checkout flow: login gate -> address -> Razorpay Checkout -> server verify.
const Checkout = (() => {
  function openAddressModal() {
    document.getElementById('checkoutBackdrop').classList.add('open');
    prefillSavedAddress();
  }
  function closeAddressModal() {
    document.getElementById('checkoutBackdrop').classList.remove('open');
  }

  // Saves the customer retyping an address they already have on file.
  function prefillSavedAddress() {
    const saved = Auth.getUser()?.addresses?.[0];
    if (!saved) return;
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = value || '';
    };
    set('addrLine1', saved.line1);
    set('addrLine2', saved.line2);
    set('addrCity', saved.city);
    set('addrState', saved.state);
    set('addrPincode', saved.pincode);
    set('addrPhone', saved.phone);
  }

  function beginCheckout() {
    if (Cart.count() === 0) {
      showToast('Your cart is empty', 'error');
      return;
    }
    if (!Auth.isLoggedIn()) {
      showToast('Please log in to place your order', 'error');
      Auth.open('login', () => openAddressModal());
      return;
    }
    openAddressModal();
  }

  function payWithRazorpay(orderResp, address) {
    return new Promise((resolve, reject) => {
      const rzp = new Razorpay({
        key: orderResp.keyId,
        amount: orderResp.amount,
        currency: orderResp.currency,
        name: 'Namita Ji',
        description: 'Order Payment',
        image: '/images/logo.png',
        order_id: orderResp.razorpayOrderId,
        prefill: {
          name: Auth.getUser()?.name || '',
          email: Auth.getUser()?.email || '',
          contact: address.phone || ''
        },
        theme: { color: '#681010' },
        handler: (response) => resolve(response),
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled'))
        }
      });
      rzp.on('payment.failed', (resp) => reject(new Error(resp.error?.description || 'Payment failed')));
      rzp.open();
    });
  }

  function readAddress() {
    return {
      line1: document.getElementById('addrLine1').value.trim(),
      line2: document.getElementById('addrLine2').value.trim(),
      city: document.getElementById('addrCity').value.trim(),
      state: document.getElementById('addrState').value.trim(),
      pincode: document.getElementById('addrPincode').value.trim(),
      phone: document.getElementById('addrPhone').value.trim()
    };
  }

  function addressProblem(a) {
    if (!/^\d{6}$/.test(a.pincode)) return 'Please enter a valid 6-digit pincode';
    if (!/^[6-9]\d{9}$/.test(a.phone.replace(/\D/g, '').slice(-10))) {
      return 'Please enter a valid 10-digit mobile number';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errorEl = document.getElementById('checkoutError');
    const submitBtn = document.getElementById('checkoutSubmit');
    errorEl.textContent = '';

    const address = readAddress();
    const problem = addressProblem(address);
    if (problem) {
      errorEl.textContent = problem;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    // Tracks whether Razorpay reported a successful payment. Once it has, the money
    // is gone from the customer's account — from that point on we must never show a
    // plain "failed" message that could tempt them into paying a second time.
    let paymentTaken = false;

    try {
      const items = Cart.items().map((i) => ({ productId: i.productId, quantity: i.quantity }));
      const orderResp = await api('/orders/create', { method: 'POST', auth: true, body: { items, address } });

      const rzResponse = await payWithRazorpay(orderResp, address);
      paymentTaken = true;

      submitBtn.textContent = 'Confirming payment…';
      const result = await api('/orders/verify', {
        method: 'POST',
        auth: true,
        body: {
          orderId: orderResp.orderId,
          razorpay_order_id: rzResponse.razorpay_order_id,
          razorpay_payment_id: rzResponse.razorpay_payment_id,
          razorpay_signature: rzResponse.razorpay_signature
        }
      });

      Cart.clear();
      closeAddressModal();
      Cart.closeDrawer();

      if (result.pending) {
        showToast(result.error, 'error');
      } else {
        showToast('Payment successful! Your order is confirmed.', 'success');
      }
      setTimeout(() => (location.href = '/profile.html#orders'), 1400);
    } catch (err) {
      if (paymentTaken) {
        // Payment went through but confirmation didn't complete. The Razorpay webhook
        // will settle the order server-side, so send them to their order history
        // rather than back to a "pay again" button.
        Cart.clear();
        closeAddressModal();
        Cart.closeDrawer();
        showToast(
          'Your payment went through, but confirmation is still catching up. Your order will appear shortly — please do not pay again.',
          'error'
        );
        setTimeout(() => (location.href = '/profile.html#orders'), 2500);
      } else {
        errorEl.textContent = err.message || 'Payment could not be completed';
        if (err.message !== 'Payment cancelled') showToast(err.message, 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pay Now';
    }
  }

  function init() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!checkoutBtn) return;
    checkoutBtn.onclick = beginCheckout;
    document.getElementById('checkoutClose').onclick = closeAddressModal;
    document.getElementById('checkoutBackdrop').addEventListener('click', (e) => {
      if (e.target === document.getElementById('checkoutBackdrop')) closeAddressModal();
    });
    document.getElementById('checkoutForm').addEventListener('submit', handleSubmit);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Checkout.init);
