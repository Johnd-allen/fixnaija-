const path = require('path');
const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveBase64File } = require('../utils/http');
const { logAdminAction, notify } = require('../utils/audit');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

function register(router) {
  // Provider submits a verification application with documents (base64)
  router.post('/api/me/verification', requireAuth(['provider'])(async (req, res, ctx) => {
    const provider = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    if (!provider) return { status: 404, body: { error: 'Provider profile not found' } };
    const { fullLegalName, address, documents } = ctx.body; // documents: [{docType, base64}]
    if (!fullLegalName || !address) return { status: 400, body: { error: 'fullLegalName and address are required' } };
    if (!Array.isArray(documents) || documents.length === 0) {
      return { status: 400, body: { error: 'At least one identification document is required' } };
    }
    const appId = uuid();
    run(
      'INSERT INTO verification_applications (id, provider_id, full_legal_name, address, status) VALUES (?,?,?,?,?)',
      [appId, provider.id, fullLegalName, address, 'PENDING']
    );
    for (const doc of documents) {
      const relPath = saveBase64File(UPLOADS_DIR, `verification/${provider.id}`, doc.base64, 'jpg');
      run(
        'INSERT INTO verification_documents (id, application_id, doc_type, path) VALUES (?,?,?,?)',
        [uuid(), appId, doc.docType || 'OTHER', relPath]
      );
    }
    run("UPDATE provider_profiles SET verification_status='PENDING' WHERE id=?", [provider.id]);
    return { status: 201, body: { id: appId, status: 'PENDING' } };
  }));

  router.get('/api/me/verification', requireAuth(['provider'])(async (req, res, ctx) => {
    const provider = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    const apps = all('SELECT * FROM verification_applications WHERE provider_id = ? ORDER BY created_at DESC', [provider.id]);
    return { status: 200, body: apps };
  }));

  // ---- Admin review (documents are never exposed via the public provider endpoints) ----
  router.get('/api/admin/verification', requireAuth(['admin'])(async (req, res, ctx) => {
    const status = ctx.query.status || 'PENDING';
    const apps = all(
      `SELECT va.*, u.full_name, u.phone FROM verification_applications va
       JOIN provider_profiles pp ON pp.id = va.provider_id
       JOIN users u ON u.id = pp.user_id
       WHERE va.status = ? ORDER BY va.created_at ASC`,
      [status]
    );
    return { status: 200, body: apps };
  }));

  router.get('/api/admin/verification/:id', requireAuth(['admin'])(async (req, res, ctx) => {
    const app = get('SELECT * FROM verification_applications WHERE id = ?', [ctx.params.id]);
    if (!app) return { status: 404, body: { error: 'Not found' } };
    const documents = all('SELECT * FROM verification_documents WHERE application_id = ?', [app.id]);
    return { status: 200, body: { ...app, documents } };
  }));

  router.post('/api/admin/verification/:id/decide', requireAuth(['admin'])(async (req, res, ctx) => {
    const { decision, notes } = ctx.body; // 'VERIFIED' | 'REJECTED'
    if (!['VERIFIED', 'REJECTED'].includes(decision)) return { status: 400, body: { error: 'decision must be VERIFIED or REJECTED' } };
    const app = get('SELECT * FROM verification_applications WHERE id = ?', [ctx.params.id]);
    if (!app) return { status: 404, body: { error: 'Application not found' } };
    run(
      "UPDATE verification_applications SET status=?, admin_notes=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?",
      [decision, notes || null, ctx.user.id, app.id]
    );
    run('UPDATE provider_profiles SET verification_status=? WHERE id=?', [decision, app.provider_id]);
    const provider = get('SELECT user_id FROM provider_profiles WHERE id = ?', [app.provider_id]);
    notify(
      provider.user_id,
      decision === 'VERIFIED' ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
      decision === 'VERIFIED' ? 'You are now a Verified Professional' : 'Verification was not approved',
      notes || null
    );
    logAdminAction(ctx.user.id, `VERIFICATION_${decision}`, 'verification_application', app.id, notes);
    return { status: 200, body: { ok: true, status: decision } };
  }));
}

module.exports = register;
