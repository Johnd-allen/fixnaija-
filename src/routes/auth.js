const { get, run, uuid } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../utils/auth');
const { setAuthCookie, clearAuthCookie } = require('../utils/http');
const { getCurrentUser } = require('../middleware/auth');

const PHONE_RE = /^\+234\d{10}$/;

function register(router) {
  router.post('/api/auth/register', async (req, res, ctx) => {
    const { full_name, phone, email, password, role } = ctx.body;
    if (!full_name || !phone || !password) {
      return { status: 400, body: { error: 'full_name, phone and password are required' } };
    }
    if (!PHONE_RE.test(phone)) {
      return { status: 400, body: { error: 'Phone must be a Nigerian number in the form +234XXXXXXXXXX' } };
    }
    if (password.length < 6) {
      return { status: 400, body: { error: 'Password must be at least 6 characters' } };
    }
    const wantedRole = role === 'provider' ? 'provider' : 'customer'; // admins are never self-registered
    const existing = get('SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)', [phone, email || null]);
    if (existing) return { status: 409, body: { error: 'An account with this phone or email already exists' } };

    const id = uuid();
    run(
      'INSERT INTO users (id, full_name, phone, email, password_hash, role) VALUES (?,?,?,?,?,?)',
      [id, full_name, phone, email || null, hashPassword(password), wantedRole]
    );
    if (wantedRole === 'provider') {
      run('INSERT INTO provider_profiles (id, user_id) VALUES (?,?)', [uuid(), id]);
    }
    const token = signToken({ sub: id, role: wantedRole });
    setAuthCookie(res, token);
    const user = get('SELECT id, full_name, phone, email, role, status FROM users WHERE id = ?', [id]);
    return { status: 201, body: { user, token } };
  });

  router.post('/api/auth/login', async (req, res, ctx) => {
    const { identifier, password } = ctx.body; // identifier = phone or email
    if (!identifier || !password) return { status: 400, body: { error: 'identifier and password are required' } };
    const user = get('SELECT * FROM users WHERE phone = ? OR email = ?', [identifier, identifier]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }
    if (user.status === 'SUSPENDED') return { status: 403, body: { error: 'Your account has been suspended. Contact support.' } };
    if (user.status === 'DELETED') return { status: 403, body: { error: 'This account no longer exists.' } };
    const token = signToken({ sub: user.id, role: user.role });
    setAuthCookie(res, token);
    delete user.password_hash;
    return { status: 200, body: { user, token } };
  });

  router.post('/api/auth/logout', async (req, res) => {
    clearAuthCookie(res);
    return { status: 200, body: { ok: true } };
  });

  router.get('/api/auth/me', async (req) => {
    const user = getCurrentUser(req);
    if (!user) return { status: 401, body: { error: 'Not authenticated' } };
    let providerId = null;
    if (user.role === 'provider') {
      const p = get('SELECT id FROM provider_profiles WHERE user_id = ?', [user.id]);
      providerId = p ? p.id : null;
    }
    return { status: 200, body: { user, providerId } };
  });
}

module.exports = register;
