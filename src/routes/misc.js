const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { serializeProvider } = require('./providers');

function register(router) {
  // ---- Favorites ----
  router.post('/api/favorites/:providerId', requireAuth(['customer'])(async (req, res, ctx) => {
    run('INSERT OR IGNORE INTO favorites (id, customer_id, provider_id) VALUES (?,?,?)', [uuid(), ctx.user.id, ctx.params.providerId]);
    return { status: 200, body: { ok: true } };
  }));

  router.delete('/api/favorites/:providerId', requireAuth(['customer'])(async (req, res, ctx) => {
    run('DELETE FROM favorites WHERE customer_id = ? AND provider_id = ?', [ctx.user.id, ctx.params.providerId]);
    return { status: 200, body: { ok: true } };
  }));

  router.get('/api/favorites', requireAuth(['customer'])(async (req, res, ctx) => {
    const rows = all(
      `SELECT pp.* FROM favorites f JOIN provider_profiles pp ON pp.id = f.provider_id WHERE f.customer_id = ? ORDER BY f.created_at DESC`,
      [ctx.user.id]
    );
    return { status: 200, body: rows.map(serializeProvider) };
  }));

  // ---- Notifications ----
  router.get('/api/notifications', requireAuth()(async (req, res, ctx) => {
    const rows = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [ctx.user.id]);
    return { status: 200, body: rows };
  }));

  router.post('/api/notifications/:id/read', requireAuth()(async (req, res, ctx) => {
    run("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?", [ctx.params.id, ctx.user.id]);
    return { status: 200, body: { ok: true } };
  }));

  router.post('/api/notifications/read-all', requireAuth()(async (req, res, ctx) => {
    run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", [ctx.user.id]);
    return { status: 200, body: { ok: true } };
  }));

  // ---- Reports (fraud, harassment, fake reviews, etc.) ----
  router.post('/api/reports', requireAuth()(async (req, res, ctx) => {
    const { reportedUserId, requestId, reason, description, evidenceBase64 } = ctx.body;
    const validReasons = ['FRAUD', 'FAKE_IDENTITY', 'POOR_SERVICE', 'HARASSMENT', 'FAKE_REVIEW', 'ILLEGAL_ACTIVITY', 'PAYMENT_PROBLEM', 'OTHER'];
    if (!validReasons.includes(reason)) return { status: 400, body: { error: 'Invalid reason' } };
    let evidencePath = null;
    if (evidenceBase64) {
      const { saveBase64File } = require('../utils/http');
      const path = require('path');
      evidencePath = saveBase64File(path.join(__dirname, '..', '..', 'public', 'uploads'), 'reports', evidenceBase64, 'jpg');
    }
    const id = uuid();
    run(
      'INSERT INTO reports (id, reporter_id, reported_user_id, request_id, reason, description, evidence_path) VALUES (?,?,?,?,?,?,?)',
      [id, ctx.user.id, reportedUserId || null, requestId || null, reason, description || null, evidencePath]
    );
    return { status: 201, body: { id, status: 'OPEN' } };
  }));

  router.get('/api/admin/reports', requireAuth(['admin'])(async (req, res, ctx) => {
    const status = ctx.query.status || 'OPEN';
    const rows = all(
      `SELECT r.*, ru.full_name as reporter_name, tu.full_name as reported_name FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN users tu ON tu.id = r.reported_user_id
       WHERE r.status = ? ORDER BY r.created_at ASC`,
      [status]
    );
    return { status: 200, body: rows };
  }));

  router.post('/api/admin/reports/:id/resolve', requireAuth(['admin'])(async (req, res, ctx) => {
    const { status, adminNotes } = ctx.body; // RESOLVED | DISMISSED | UNDER_REVIEW
    const { logAdminAction } = require('../utils/audit');
    run('UPDATE reports SET status=?, admin_notes=? WHERE id=?', [status, adminNotes || null, ctx.params.id]);
    logAdminAction(ctx.user.id, `REPORT_${status}`, 'report', ctx.params.id, adminNotes);
    return { status: 200, body: { ok: true } };
  }));

  // ---- Disputes ----
  router.post('/api/requests/:id/dispute', requireAuth()(async (req, res, ctx) => {
    const { reason } = ctx.body;
    const id = uuid();
    run('INSERT INTO disputes (id, request_id, raised_by, reason) VALUES (?,?,?,?)', [id, ctx.params.id, ctx.user.id, reason || 'Not specified']);
    return { status: 201, body: { id, status: 'OPEN' } };
  }));

  router.get('/api/admin/disputes', requireAuth(['admin'])(async (req, res, ctx) => {
    const status = ctx.query.status || 'OPEN';
    const rows = all(
      `SELECT d.*, u.full_name as raised_by_name FROM disputes d JOIN users u ON u.id = d.raised_by WHERE d.status = ? ORDER BY d.created_at ASC`,
      [status]
    );
    return { status: 200, body: rows };
  }));

  router.post('/api/admin/disputes/:id/resolve', requireAuth(['admin'])(async (req, res, ctx) => {
    const { status, resolutionNotes } = ctx.body;
    const { logAdminAction } = require('../utils/audit');
    run("UPDATE disputes SET status=?, resolution_notes=?, resolved_at=datetime('now') WHERE id=?", [status, resolutionNotes || null, ctx.params.id]);
    logAdminAction(ctx.user.id, `DISPUTE_${status}`, 'dispute', ctx.params.id, resolutionNotes);
    return { status: 200, body: { ok: true } };
  }));
}

module.exports = register;
