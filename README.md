# Namita Ji — Traditional Indian Snacks & Food

Full-stack e-commerce site: Node/Express + MongoDB backend, vanilla HTML/CSS/JS frontend,
Razorpay payments (products + donations), JWT auth, and an admin dashboard.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

- `MONGO_URI` — MongoDB Atlas connection string.
- `JWT_SECRET` — any long random string (`openssl rand -hex 32`).
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from the Razorpay dashboard. Use **test mode** keys until you're ready to go live.
- `RAZORPAY_WEBHOOK_SECRET` — create a webhook in Razorpay Dashboard → Settings → Webhooks, pointing to `https://<your-domain>/api/webhook/razorpay`, subscribed to the `payment.captured` event, and paste its secret here. The webhook is the server-to-server safety net that confirms payment even if the browser flow is interrupted — don't skip it in production.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used once by the seed script to create your first admin login.

## 3. Add the logo

Save the brand logo as `public/images/logo.png` (used as the favicon, header logo, and hero art).

## 4. Seed the database

Creates the admin account and 6 sample products:

```bash
npm run seed
```

## 5. Run

```bash
npm run dev     # with nodemon, auto-restart
# or
npm start
```

Visit `http://localhost:5000`. Admin dashboard: `http://localhost:5000/admin` (log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## How payments stay fraud-safe

1. **Prices are never trusted from the browser.** `/api/orders/create` re-reads product prices from MongoDB before creating the Razorpay order.
2. **Signature verification is mandatory.** `/api/orders/verify` and `/api/donations/verify` recompute the HMAC-SHA256 signature server-side (`utils/razorpay.js`) before marking anything "paid" — a forged success callback cannot mark an order paid.
3. **Webhook as the real source of truth.** `/api/webhook/razorpay` independently confirms `payment.captured` events straight from Razorpay's servers, so a payment still gets recorded even if the customer closes the tab right after paying.
4. **Every payment event is logged immutably** to the `paymentlogs` collection (order created, verify success/failure, webhook hits, refunds) — this is what the admin's "Payment Logs" tab shows, and what you'd hand to Razorpay support if a dispute ever comes up.
5. **Refunds only move money through Razorpay's refund API**, triggered by an admin action, never automatically.

## Going to production

- Use **live** Razorpay keys only after testing thoroughly in test mode.
- Serve over HTTPS (required by Razorpay Checkout in live mode).
- Set `NODE_ENV=production`.
- Put MongoDB Atlas on a production tier with backups enabled.
- Rotate `JWT_SECRET` and keep `.env` out of version control (already gitignored).
- Consider adding email receipts (order confirmation / refund confirmation) — not included yet.
