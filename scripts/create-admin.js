#!/usr/bin/env node
/**
 * Creates an admin account. Admins can never self-register through the app
 * (see src/routes/auth.js), so this script is the supported way to create
 * the first admin — and any additional ones — for FixNaija.
 *
 * Usage:
 *   node scripts/create-admin.js "Full Name" "+2348012345678" "email@example.com" "password123"
 */
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db'));
const { hashPassword } = require(path.join(__dirname, '..', 'src', 'utils', 'auth'));

const [, , fullName, phone, email, password] = process.argv;

if (!fullName || !phone || !password) {
  console.error('Usage: node scripts/create-admin.js "Full Name" "+2348012345678" "email@example.com" "password123"');
  process.exit(1);
}
if (!/^\+234\d{10}$/.test(phone)) {
  console.error('Phone must be a Nigerian number in the form +234XXXXXXXXXX');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters');
  process.exit(1);
}

const existing = db.get('SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)', [phone, email || null]);
if (existing) {
  console.error('A user with this phone or email already exists.');
  process.exit(1);
}

const id = db.uuid();
db.run(
  'INSERT INTO users (id, full_name, phone, email, password_hash, role) VALUES (?,?,?,?,?,?)',
  [id, fullName, phone, email || null, hashPassword(password), 'admin']
);

console.log(`Admin account created: ${fullName} (${phone}) — id ${id}`);
