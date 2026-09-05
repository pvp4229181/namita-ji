const nodemailer = require('nodemailer');

// Built lazily and cached — most requests never send mail, and env vars may
// not be set (e.g. running the API without email configured).
let transporter;
let transporterError;

function getTransporter() {
  if (transporter || transporterError) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporterError = new Error('SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    return null;
  }
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function sendWelcomeEmail(user) {
  const t = getTransporter();
  if (!t) throw transporterError;

  const name = escapeHtml(user.name || 'there');
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: 'Welcome to Namita Ji!',
    html: `
      <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#3a2a24">
        <h2 style="color:#681010">Welcome, ${name}!</h2>
        <p>Thanks for creating an account with Namita Ji — traditional Indian snacks and sweets, made the way home does.</p>
        <p>Your account is ready. Browse the catalog and place your first order whenever you're ready.</p>
        <p style="margin-top:24px;color:#7a6a63;font-size:0.85rem">If you didn't create this account, you can ignore this email.</p>
      </div>
    `,
    text: `Welcome, ${user.name || 'there'}!\n\nThanks for creating an account with Namita Ji. Your account is ready — browse the catalog and place your first order whenever you're ready.\n\nIf you didn't create this account, you can ignore this email.`
  });
}

module.exports = { sendWelcomeEmail };
