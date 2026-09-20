const path = require('path');
const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveBase64File } = require('../utils/http');
const { notify } = require('../utils/audit');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

function isBlocked(a, b) {
  return !!get('SELECT id FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [a, b, b, a]);
}

function register(router) {
  router.post('/api/messages', requireAuth()(async (req, res, ctx) => {
    const { recipientId, body, imageBase64, requestId } = ctx.body;
    if (!recipientId || (!body && !imageBase64)) return { status: 400, body: { error: 'recipientId and a message body or image are required' } };
    if (isBlocked(ctx.user.id, recipientId)) return { status: 403, body: { error: 'Messaging is blocked between these users' } };
    let imagePath = null;
    if (imageBase64) imagePath = saveBase64File(UPLOADS_DIR, 'messages', imageBase64, 'jpg');
    const id = uuid();
    run(
      'INSERT INTO messages (id, request_id, sender_id, recipient_id, body, image_path) VALUES (?,?,?,?,?,?)',
      [id, requestId || null, ctx.user.id, recipientId, body || null, imagePath]
    );
    notify(recipientId, 'NEW_MESSAGE', 'New message', body ? body.slice(0, 120) : 'Sent an image', { senderId: ctx.user.id });
    return { status: 201, body: get('SELECT * FROM messages WHERE id = ?', [id]) };
  }));

  // list conversation partners with last message + unread count
  router.get('/api/messages/threads', requireAuth()(async (req, res, ctx) => {
    const rows = all(
      `SELECT * FROM messages WHERE sender_id = ? OR recipient_id = ? ORDER BY created_at DESC`,
      [ctx.user.id, ctx.user.id]
    );
    const threads = new Map();
    for (const m of rows) {
      const otherId = m.sender_id === ctx.user.id ? m.recipient_id : m.sender_id;
      if (!threads.has(otherId)) {
        const other = get('SELECT id, full_name, role FROM users WHERE id = ?', [otherId]);
        threads.set(otherId, {
          userId: otherId,
          name: other ? other.full_name : 'Unknown user',
          role: other ? other.role : null,
          lastMessage: m.body || '📷 Photo',
          lastAt: m.created_at,
          unread: 0,
        });
      }
      if (m.recipient_id === ctx.user.id && !m.read_at) threads.get(otherId).unread += 1;
    }
    return { status: 200, body: Array.from(threads.values()) };
  }));

  router.get('/api/messages/thread/:userId', requireAuth()(async (req, res, ctx) => {
    const otherId = ctx.params.userId;
    const rows = all(
      `SELECT * FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)
       ORDER BY created_at ASC`,
      [ctx.user.id, otherId, otherId, ctx.user.id]
    );
    run("UPDATE messages SET read_at = datetime('now') WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL", [ctx.user.id, otherId]);
    return { status: 200, body: rows };
  }));

  router.post('/api/messages/block', requireAuth()(async (req, res, ctx) => {
    const { userId } = ctx.body;
    if (!userId) return { status: 400, body: { error: 'userId required' } };
    run('INSERT OR IGNORE INTO blocked_users (id, blocker_id, blocked_id) VALUES (?,?,?)', [uuid(), ctx.user.id, userId]);
    return { status: 200, body: { ok: true } };
  }));
}

module.exports = register;
