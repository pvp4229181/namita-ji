// "Donate Now" button flow — works for guests too, but prefills from a logged-in user.
const Donate = (() => {
  let selectedAmount = null;

  function init() {
    const chips = document.querySelectorAll('.amount-chip');
    const customInput = document.getElementById('customDonateAmt');

    chips.forEach((chip) => {
      chip.onclick = () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        selectedAmount = Number(chip.dataset.amt);
        customInput.value = '';
      };
    });

    customInput.addEventListener('input', () => {
      chips.forEach((c) => c.classList.remove('active'));
      selectedAmount = Number(customInput.value) || null;
    });

    document.getElementById('donateNowBtn').onclick = handleDonate;
  }

  async function handleDonate() {
    const amount = selectedAmount;
    if (!amount || amount < 1) {
      showToast('Please choose or enter a donation amount', 'error');
      return;
    }

    const user = Auth.getUser();
    let name = user?.name;
    let email = user?.email;
    let phone = user?.phone;

    if (!name || !email) {
      name = prompt('Your name (for the donation receipt):');
      if (!name) return;
      email = prompt('Your email (for the donation receipt):');
      if (!email) return;
    }

    const btn = document.getElementById('donateNowBtn');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      const orderResp = await api('/donations/create', {
        method: 'POST',
        body: { name, email, phone, amount, userId: user?.id }
      });

      const rzResponse = await new Promise((resolve, reject) => {
        const rzp = new Razorpay({
          key: orderResp.keyId,
          amount: orderResp.amount,
          currency: orderResp.currency,
          name: 'Namita Ji',
          description: 'Donation',
          image: '/images/logo.png',
          order_id: orderResp.razorpayOrderId,
          prefill: { name, email, contact: phone || '' },
          theme: { color: '#7a1e2b' },
          handler: (resp) => resolve(resp),
          modal: { ondismiss: () => reject(new Error('Donation cancelled')) }
        });
        rzp.on('payment.failed', (resp) => reject(new Error(resp.error?.description || 'Payment failed')));
        rzp.open();
      });

      await api('/donations/verify', {
        method: 'POST',
        body: {
          donationId: orderResp.donationId,
          razorpay_order_id: rzResponse.razorpay_order_id,
          razorpay_payment_id: rzResponse.razorpay_payment_id,
          razorpay_signature: rzResponse.razorpay_signature
        }
      });

      showToast('Thank you for your generous donation! 🙏', 'success');
    } catch (err) {
      showToast(err.message || 'Donation could not be completed', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Donate Now';
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Donate.init);
