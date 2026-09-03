// Cart checkout flow: login gate -> address -> Razorpay Checkout -> server verify.
const Checkout = (() => {
  function openAddressModal() {
    document.getElementById('checkoutBackdrop').classList.add('open');
  }
  function closeAddressModal() {
    document.getElementById('checkoutBackdrop').classList.remove('open');
  }

  function beginCheckout() {
    if (Cart.count() === 0) {
      showToast('Your cart is empty', 'error');
      return;
    }
    if (!Auth.isLoggedIn()) {
      Auth.open('login', () => openAddressModal());
      return;
    }
    openAddressModal();
  }

  async function payWithRazorpay(orderResp, address) {
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
        theme: { color: '#7a1e2b' },
        handler: function (response) {
          resolve(response);
        },
        modal: {
          ondismiss: function () {
            reject(new Error('Payment cancelled'));
          }
        }
      });
      rzp.on('payment.failed', function (resp) {
        reject(new Error(resp.error?.description || 'Payment failed'));
      });
      rzp.open();
    });
  }

  function init() {
    document.getElementById('checkoutBtn').onclick = beginCheckout;
    document.getElementById('checkoutClose').onclick = closeAddressModal;
    document.getElementById('checkoutBackdrop').addEventListener('click', (e) => {
      if (e.target === document.getElementById('checkoutBackdrop')) closeAddressModal();
    });

    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('checkoutError');
      errorEl.textContent = '';
      const submitBtn = document.getElementById('checkoutSubmit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing…';

      const address = {
        line1: document.getElementById('addrLine1').value.trim(),
        line2: document.getElementById('addrLine2').value.trim(),
        city: document.getElementById('addrCity').value.trim(),
        state: document.getElementById('addrState').value.trim(),
        pincode: document.getElementById('addrPincode').value.trim(),
        phone: document.getElementById('addrPhone').value.trim()
      };

      try {
        const items = Cart.items().map((i) => ({ productId: i.productId, quantity: i.quantity }));
        const orderResp = await api('/orders/create', { method: 'POST', auth: true, body: { items, address } });

        const rzResponse = await payWithRazorpay(orderResp, address);

        await api('/orders/verify', {
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
        showToast('Payment successful! Your order is confirmed.', 'success');
        setTimeout(() => (location.href = '/profile.html#orders'), 1200);
      } catch (err) {
        errorEl.textContent = err.message || 'Payment could not be completed';
        showToast(err.message || 'Payment could not be completed', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pay Now';
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Checkout.init);
