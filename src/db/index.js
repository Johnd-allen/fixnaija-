const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'fixnaija.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function uuid() {
  return crypto.randomUUID();
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function seed() {
  const catCount = get('SELECT COUNT(*) as c FROM service_categories').c;
  if (catCount === 0) {
    const categories = [
      ['Plumber', '🔧'], ['Electrician', '⚡'], ['Mechanic', '🚗'],
      ['Generator Technician', '🔋'], ['AC Technician', '❄️'], ['Carpenter', '🪚'],
      ['Painter', '🎨'], ['Tiler', '🧱'], ['Welder', '🔨'], ['Bricklayer', '🧱'],
      ['POP/Ceiling Installer', '🏠'], ['Appliance Repair Technician', '🧰'],
      ['Phone/Computer Technician', '💻'], ['Locksmith', '🔑'],
      ['Cleaning Professional', '🧹'], ['Moving Services', '🚚'], ['Other Artisan', '🛠️'],
    ];
    for (const [name, icon] of categories) {
      run('INSERT INTO service_categories (id, name, icon) VALUES (?,?,?)', [uuid(), name, icon]);
    }
  }

  const locCount = get('SELECT COUNT(*) as c FROM locations').c;
  if (locCount === 0) {
    const data = {
      'Rivers State': {
        'Port Harcourt': ['Rumuodara', 'Rumuola', 'GRA Phase 2', 'Trans Amadi', 'D-Line', 'Woji', 'Eliozu', 'Rumuokwuta'],
        'Obio-Akpor': ['Rumuigbo', 'Rumuokoro'],
      },
      'Lagos': {
        'Ikeja': ['Allen Avenue', 'Opebi', 'Oregun'],
        'Lekki': ['Phase 1', 'Ajah', 'Chevron'],
        'Surulere': ['Adeniran Ogunsanya', 'Ojuelegba'],
        'Yaba': ['Sabo', 'Akoka'],
      },
      'FCT Abuja': {
        'Garki': ['Area 1', 'Area 11'],
        'Wuse': ['Zone 2', 'Zone 4'],
        'Gwarinpa': ['3rd Avenue', '7th Avenue'],
      },
    };
    for (const state of Object.keys(data)) {
      for (const city of Object.keys(data[state])) {
        for (const area of data[state][city]) {
          run('INSERT INTO locations (id, state, city, area) VALUES (?,?,?,?)', [uuid(), state, city, area]);
        }
      }
    }
  }
}
seed();

function ensureAdminFromEnv() {
  const { ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_PHONE || !ADMIN_PASSWORD) return;
  const existing = get('SELECT id FROM users WHERE phone = ?', [ADMIN_PHONE]);
  if (existing) {
    console.log(`[ensureAdminFromEnv] Admin with phone ${ADMIN_PHONE} already exists — skipping.`);
    return;
  }
  const { hashPassword } = require('../utils/auth');
  const id = uuid();
  run(
    'INSERT INTO users (id, full_name, phone, email, password_hash, role) VALUES (?,?,?,?,?,?)',
    [id, ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL || null, hashPassword(ADMIN_PASSWORD), 'admin']
  );
  console.log(`[ensureAdminFromEnv] Created admin account for ${ADMIN_NAME} (${ADMIN_PHONE}).`);
}
ensureAdminFromEnv();

module.exports = { db, run, get, all, uuid, DB_PATH };
