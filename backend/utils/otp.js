const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function generateCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function hashCode(code) {
  return bcrypt.hash(code, 10);
}

function compareCode(code, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(code, hash);
}

module.exports = { generateCode, hashCode, compareCode };
