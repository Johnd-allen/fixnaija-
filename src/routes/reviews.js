const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notify, logAdminAction } = require('../utils/audit');

function recalcProviderRating(providerId) {
  const row = get("SELECT AVG(overall) as avg, COUNT(*) as cnt FROM reviews WHERE provider_id = ? AND status = 'PUBLISHED'", [providerId]);
  run('UPDATE provider_profiles SET avg_rating = ?, review_count = ? WHERE id = ?', [row.avg || 0, row.cnt || 0, providerId]);
}

function register(router) {
  router.post('/api/requests/:id/review', requireAuth(['customer'])(async (req, res, ctx) => {
    const r = get('SELECT * FROM requests WHERE id = ?', [ctx.params.id]);
    if (!r) return { status: 404, body: { error: 'Request not found' } };
    if (r.customer_id !== ctx.user.id) return { status: 403, body: { error: 'Not your request' } };
    if (r.status !== 'COMPLETED') {
      return { status: 400, body: { error: 'Only completed jobs can be reviewed' } };
    }
    const existing = get('SELECT id FROM reviews WHERE request_id = ?', [r.id]);
    if (existing) return { status: 409, body: { error: 'This job has already been reviewed' } };

    const b = ctx.body;
    const fields = ['overall', 'quality', 'professionalism', 'communication', 'valueForMoney', 'punctuality'];
    for (const f of fields) {
      if (!Number.isInteger(b[f]) || b[f] < 1 || b[f] > 5) {
        return { status: 400, body: { error: `${f} must be an integer between 1 and 5` } };
      }
    }
    const id = uuid();
    run(
      `INSERT INTO reviews (id, request_id, customer_id, provider_id, overall, quality, professionalism,
        communication, value_for_money, punctuality, comment)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, r.id, ctx.user.id, r.provider_id, b.overall, b.quality, b.professionalism, b.communication, b.valueForMoney, b.punctuality, b.comment || null]
    );
    recalcProviderRating(r.provider_id);
    const provider = get('SELECT user_id FROM provider_profiles WHERE id = ?', [r.provider_id]);
    notify(provider.user_id, 'NEW_REVIEW', 'You received a new review', b.comment ? b.comment.slice(0, 120) : null, { requestId: r.id });
    return { status: 201, body: get('SELECT * FROM reviews WHERE id = ?', [id]) };
  }));

  router.post('/api/reviews/:id/reply', requireAuth(['provider'])(async (req, res, ctx) => {
    const review = get('SELECT * FROM reviews WHERE id = ?', [ctx.params.id]);
    if (!review) return { status: 404, body: { error: 'Review not found' } };
    const provider = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    if (!provider || provider.id !== review.provider_id) return { status: 403, body: { error: 'Not your review to reply to' } };
    run('UPDATE reviews SET provider_reply = ? WHERE id = ?', [ctx.body.reply || '', review.id]);
    return { status: 200, body: get('SELECT * FROM reviews WHERE id = ?', [review.id]) };
  }));

  router.post('/api/reviews/:id/report', requireAuth()(async (req, res, ctx) => {
    const review = get('SELECT * FROM reviews WHERE id = ?', [ctx.params.id]);
    if (!review) return { status: 404, body: { error: 'Review not found' } };
    const id = uuid();
    run('INSERT INTO review_reports (id, review_id, reporter_id, reason) VALUES (?,?,?,?)', [id, review.id, ctx.user.id, ctx.body.reason || 'Not specified']);
    run("UPDATE reviews SET status = 'FLAGGED' WHERE id = ? AND status = 'PUBLISHED'", [review.id]);
    return { status: 201, body: { ok: true } };
  }));

  // ---- Admin moderation ----
  router.get('/api/admin/review-reports', requireAuth(['admin'])(async (req, res, ctx) => {
    const status = ctx.query.status || 'OPEN';
    const rows = all(
      `SELECT rr.*, r.comment, r.overall, r.provider_id FROM review_reports rr
       JOIN reviews r ON r.id = rr.review_id WHERE rr.status = ? ORDER BY rr.created_at DESC`,
      [status]
    );
    return { status: 200, body: rows };
  }));

  router.post('/api/admin/reviews/:id/moderate', requireAuth(['admin'])(async (req, res, ctx) => {
    const { action } = ctx.body; // 'HIDE' | 'RESTORE'
    const review = get('SELECT * FROM reviews WHERE id = ?', [ctx.params.id]);
    if (!review) return { status: 404, body: { error: 'Review not found' } };
    const status = action === 'HIDE' ? 'HIDDEN' : 'PUBLISHED';
    run('UPDATE reviews SET status = ? WHERE id = ?', [status, review.id]);
    recalcProviderRating(review.provider_id);
    logAdminAction(ctx.user.id, `REVIEW_${action}`, 'review', review.id);
    return { status: 200, body: { ok: true } };
  }));
}

module.exports = register;
