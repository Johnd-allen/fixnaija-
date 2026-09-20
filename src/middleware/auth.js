const { verifyToken } = require('../utils/auth');
const { get } = require('../db');
const { parseCookies } = require('../utils/http');

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  let token = cookies.fixnaija_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts[0] === 'Bearer') token = parts[1];
  }
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = get('SELECT id, full_name, phone, email, role, status FROM users WHERE id = ?', [payload.sub]);
  if (!user || user.status !== 'ACTIVE') return null;
  return user;
}

// wraps a handler so it 401s if not logged in, and optionally 403s by role
function requireAuth(roles) {
  return (handler) => async (req, res, ctx) => {
    const user = getCurrentUser(req);
    if (!user) return { status: 401, body: { error: 'Not authenticated' } };
    if (roles && !roles.includes(user.role)) {
      return { status: 403, body: { error: 'Not permitted for this role' } };
    }
    ctx.user = user;
    return handler(req, res, ctx);
  };
}

module.exports = { getCurrentUser, requireAuth };
