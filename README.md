# Namita Ji — Traditional Indian Snacks & Food

Full-stack e-commerce site: Node/Express + MongoDB backend, vanilla HTML/CSS/JS frontend,
Razorpay payments, JWT auth, customer account area, and an admin dashboard.

> The donation feature's UI has been removed. Its backend (`backend/routes/donations.js`,
> `backend/models/Donation.js`, and the donation branches in the webhook handler) is left in
> place but unreachable — nothing on the site links to it. Say the word and it can be stripped
> out entirely, or the section rebuilt on top of it.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and fill in real values:

- `MONGO_URI` — MongoDB Atlas connection string.
- `JWT_SECRET` — any long random string (`openssl rand -hex 32`).
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from Razorpay Dashboard → Account & Settings → API Keys.
  Test key ids look like `rzp_test_XXXXXXXXXXXXXX` (9 + 14 characters) and secrets are 24 characters.
  Use **test mode** keys until you're ready to go live.
- `RAZORPAY_WEBHOOK_SECRET` — create a webhook in Razorpay Dashboard → Settings → Webhooks pointing to
  `https://<your-domain>/api/webhook/razorpay`, subscribed to **`payment.captured`, `payment.failed`
  and `refund.processed`**, and paste its secret here. The webhook is the server-to-server safety net
  that confirms payment even if the browser flow is interrupted — don't skip it in production.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used once by the seed script to create your first admin login.
  The password must be at least 8 characters with letters and numbers.

## 3. Add the logo

Save the brand logo as `public/images/logo.png` and point the pages at it (they currently use
`public/images/logo.svg`). A PNG is also what Razorpay Checkout displays in its payment modal.

## 4. Seed the database

Creates the admin account and sample products:

```bash
npm run seed
```

## 5. Run

```bash
npm run dev     # nodemon, auto-restart
# or
npm start
```

Visit `http://localhost:5000`. Admin dashboard: `http://localhost:5000/admin`.

> On Windows, port 5000 is often already taken. Set `PORT=5055` in `.env` if the server
> exits with `EADDRINUSE`.

## How payments stay fraud-safe

Every one of these is covered by the end-to-end checks described below.

1. **Prices are never trusted from the browser.** `/api/orders/create` re-reads product prices from
   MongoDB and computes the total itself. The client sends only product ids and quantities.
2. **Signature verification is mandatory**, using a constant-time comparison so the HMAC can't be
   guessed a character at a time through response timing (`utils/razorpay.js`).
3. **The charged amount is confirmed with Razorpay directly.** After the signature passes,
   `/verify` fetches the payment from Razorpay's API and refuses it unless the order id, currency
   (INR), captured status and exact amount all match our own record — so a real payment for ₹1 can
   never settle a ₹2,000 order.
4. **Webhooks are the source of truth.** `/api/webhook/razorpay` independently confirms
   `payment.captured`, records `payment.failed`, and syncs refunds issued from the Razorpay
   dashboard — so a payment is recorded even if the customer closes the tab.
5. **Every state change is idempotent.** The transition to `paid` is a single conditional atomic
   update (`utils/payments.js`), so the browser callback and the webhook racing on the same payment
   cannot both apply it. Stock is decremented exactly once, guarded by a `stockAdjusted` claim, and
   put back when a refund is processed.
6. **A failed verification can never downgrade a real payment.** Only a still-pending record moves
   to `failed`; a paid or refunded order is left untouched.
7. **Stock cannot go negative.** Decrements are conditional on sufficient stock; an oversell honours
   the customer's payment and flags the order for the admin instead of silently failing.
8. **Refunds are claimed atomically** before calling Razorpay, so a double-clicked Refund button
   can't issue two refunds, and only an admin can trigger one.
9. **Every payment event is logged immutably** to the `paymentlogs` collection — order created,
   verify success/failure, amount mismatches, webhook hits, refunds. This is the admin's
   "Payment Logs" tab and what you'd hand to Razorpay in a dispute.

## Verifying the payment layer

An end-to-end script exercises the money-critical paths against a running server: price tampering,
forged signatures, signatures made with the wrong secret, underpayment webhooks, replayed webhooks,
a late browser callback after the webhook already settled, cross-user access, and admin guards.
Run the server, then run the script in `scratchpad/e2e.js` (see the project notes) — all 36 checks
must pass before deploying a change to this layer.

## Going to production

- Use **live** Razorpay keys only after testing thoroughly in test mode.
- Serve over HTTPS (required by Razorpay Checkout in live mode).
- Set `NODE_ENV=production` and a real `CLIENT_URL`.
- Register the webhook against your live domain — without it, payments where the customer closed
  the tab will sit unconfirmed.
- Put MongoDB Atlas on a production tier with backups enabled.
- Rotate `JWT_SECRET` and keep `.env` out of version control (already gitignored).
- Replace the hotlinked Wikimedia hero/product images with your own photography.
- Consider adding email receipts (order confirmation / refund confirmation) — not included yet.
