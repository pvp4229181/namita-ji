// No SMS provider wired up yet — logs to the server console instead so the
// verification flow can be built and tested end-to-end. Swap the body of
// sendSms for a real provider (Twilio, MSG91, etc.) when ready; callers
// don't need to change.
async function sendSms(to, message) {
  console.log(`[SMS to ${to}] ${message}`);
}

module.exports = { sendSms };
