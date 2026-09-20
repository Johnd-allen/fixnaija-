const path = require('path');
const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveBase64File } = require('../utils/http');
const { notify } = require('../utils/audit');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

const NEXT_STATUS = {
  REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['ON_THE_WAY', 'CANCELLED', 'DISPUTED'],
  ON_THE_WAY: ['ARRIVED', 'CANCELLED', 'DISPUTED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};
// Which role may perform which transition
const ROLE_FOR_STATUS = {
  ACCEPTED: 'provider', REJECTED: 'provider', ON_THE_WAY: 'provider', ARRIVED: 'provider',
  IN_PROGRESS: 'provider', COMPLETED: 'provider', CANCELLED: 'either', DISPUTED: 'either',
};

function serializeRequest(r) {
  const customer = get('SELECT id, full_name, phone FROM users WHERE id = ?', [r.customer_id]);
  const provider = get('SELECT pp.id, pp.business_name, u.full_name, u.phone FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.id = ?', [r.provider_id]);
  const category = get('SELECT name, icon FROM service_categories WHERE id = ?', [r.category_id]);
  const location = r.location_id ? get('SELECT * FROM locations WHERE id = ?', [r.location_id]) : null;
  const photos = all('SELECT id, path FROM request_photos WHERE request_id = ?', [r.id]);
  const history = all('SELECT * FROM job_status_history WHERE request_id = ? ORDER BY created_at ASC', [r.id]);
  const review = get('SELECT id FROM reviews WHERE request_id = ?', [r.id]);
  return {
    id: r.id,
    customer,
    provider,
    category,
    description: r.description,
    location,
    addressNote: r.address_note,
    preferredDate: r.preferred_date,
    preferredTime: r.preferred_time,
    urgency: r.urgency,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    status: r.status,
    agreedPrice: r.agreed_price,
    paymentStatus: r.payment_status,
    photos,
    history,
    hasReview: !!review,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function register(router) {
  router.post('/api/requests', requireAuth(['customer'])(async (req, res, ctx) => {
    const b = ctx.body;
    if (!b.providerId || !b.categoryId || !b.description) {
      return { status: 400, body: { error: 'providerId, categoryId and description are required' } };
    }
    const provider = get('SELECT * FROM provider_profiles WHERE id = ?', [b.providerId]);
    if (!provider) return { status: 404, body: { error: 'Provider not found' } };

    const id = uuid();
    run(
      `INSERT INTO requests (id, customer_id, provider_id, category_id, description, location_id, address_note,
        preferred_date, preferred_time, urgency, budget_min, budget_max)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.user.id, b.providerId, b.categoryId, b.description, b.locationId || null, b.addressNote || null,
        b.preferredDate || null, b.preferredTime || null, b.urgency || 'NORMAL', b.budgetMin || null, b.budgetMax || null]
    );
    if (Array.isArray(b.photos)) {
      for (const base64 of b.photos) {
        const relPath = saveBase64File(UPLOADS_DIR, `requests/${id}`, base64, 'jpg');
        run('INSERT INTO request_photos (id, request_id, path) VALUES (?,?,?)', [uuid(), id, relPath]);
      }
    }
    run('INSERT INTO job_status_history (id, request_id, status, changed_by) VALUES (?,?,?,?)', [uuid(), id, 'REQUESTED', ctx.user.id]);
    notify(provider.user_id, 'NEW_REQUEST', 'New service request', b.description.slice(0, 120), { requestId: id });
    return { status: 201, body: serializeRequest(get('SELECT * FROM requests WHERE id = ?', [id])) };
  }));

  router.get('/api/requests/mine', requireAuth()(async (req, res, ctx) => {
    let rows;
    if (ctx.user.role === 'customer') {
      rows = all('SELECT * FROM requests WHERE customer_id = ? ORDER BY created_at DESC', [ctx.user.id]);
    } else if (ctx.user.role === 'provider') {
      const provider = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
      rows = provider ? all('SELECT * FROM requests WHERE provider_id = ? ORDER BY created_at DESC', [provider.id]) : [];
    } else {
      rows = all('SELECT * FROM requests ORDER BY created_at DESC LIMIT 200');
    }
    if (ctx.query.status) rows = rows.filter((r) => r.status === ctx.query.status);
    return { status: 200, body: rows.map(serializeRequest) };
  }));

  router.get('/api/requests/:id', requireAuth()(async (req, res, ctx) => {
    const r = get('SELECT * FROM requests WHERE id = ?', [ctx.params.id]);
    if (!r) return { status: 404, body: { error: 'Not found' } };
    const provider = get('SELECT * FROM provider_profiles WHERE id = ?', [r.provider_id]);
    const isOwner = r.customer_id === ctx.user.id || provider.user_id === ctx.user.id || ctx.user.role === 'admin';
    if (!isOwner) return { status: 403, body: { error: 'Not permitted' } };
    return { status: 200, body: serializeRequest(r) };
  }));

  router.post('/api/requests/:id/status', requireAuth()(async (req, res, ctx) => {
    const r = get('SELECT * FROM requests WHERE id = ?', [ctx.params.id]);
    if (!r) return { status: 404, body: { error: 'Not found' } };
    const provider = get('SELECT * FROM provider_profiles WHERE id = ?', [r.provider_id]);
    const isCustomer = r.customer_id === ctx.user.id;
    const isProvider = provider.user_id === ctx.user.id;
    if (!isCustomer && !isProvider && ctx.user.role !== 'admin') return { status: 403, body: { error: 'Not permitted' } };

    const { status: newStatus, note, agreedPrice } = ctx.body;
    const allowed = NEXT_STATUS[r.status] || [];
    if (!allowed.includes(newStatus)) {
      return { status: 400, body: { error: `Cannot move from ${r.status} to ${newStatus}` } };
    }
    const requiredRole = ROLE_FOR_STATUS[newStatus];
    if (requiredRole === 'provider' && !isProvider && ctx.user.role !== 'admin') {
      return { status: 403, body: { error: 'Only the provider can make this transition' } };
    }

    run("UPDATE requests SET status=?, updated_at=datetime('now')" + (agreedPrice ? ', agreed_price=?' : '') + ' WHERE id=?',
      agreedPrice ? [newStatus, agreedPrice, r.id] : [newStatus, r.id]);
    run('INSERT INTO job_status_history (id, request_id, status, changed_by, note) VALUES (?,?,?,?,?)', [uuid(), r.id, newStatus, ctx.user.id, note || null]);

    if (newStatus === 'COMPLETED') {
      run('UPDATE provider_profiles SET completed_jobs = completed_jobs + 1 WHERE id = ?', [provider.id]);
    }
    const notifyUserId = isProvider ? r.customer_id : provider.user_id;
    const labels = {
      ACCEPTED: 'Your request was accepted', REJECTED: 'Your request was declined',
      ON_THE_WAY: 'The professional is on the way', ARRIVED: 'The professional has arrived',
      IN_PROGRESS: 'Work has started', COMPLETED: 'Job marked completed',
      CANCELLED: 'Request was cancelled', DISPUTED: 'A dispute was raised',
    };
    notify(notifyUserId, `JOB_${newStatus}`, labels[newStatus] || newStatus, note || null, { requestId: r.id });

    return { status: 200, body: serializeRequest(get('SELECT * FROM requests WHERE id = ?', [r.id])) };
  }));
}

module.exports = { register, serializeRequest };
