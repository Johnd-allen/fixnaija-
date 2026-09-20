const { get, run, all } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logAdminAction } = require('../utils/audit');

function register(router) {
  router.get('/api/admin/stats', requireAuth(['admin'])(async () => {
    const stats = {
      totalUsers: get("SELECT COUNT(*) c FROM users WHERE role != 'admin'").c,
      totalCustomers: get("SELECT COUNT(*) c FROM users WHERE role = 'customer'").c,
      totalProviders: get("SELECT COUNT(*) c FROM users WHERE role = 'provider'").c,
      verifiedProviders: get("SELECT COUNT(*) c FROM provider_profiles WHERE verification_status = 'VERIFIED'").c,
      pendingVerification: get("SELECT COUNT(*) c FROM verification_applications WHERE status = 'PENDING'").c,
      completedJobs: get("SELECT COUNT(*) c FROM requests WHERE status = 'COMPLETED'").c,
      activeJobs: get("SELECT COUNT(*) c FROM requests WHERE status IN ('ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS')").c,
      cancelledJobs: get("SELECT COUNT(*) c FROM requests WHERE status = 'CANCELLED'").c,
      openDisputes: get("SELECT COUNT(*) c FROM disputes WHERE status = 'OPEN'").c,
      openReports: get("SELECT COUNT(*) c FROM reports WHERE status = 'OPEN'").c,
      avgPlatformRating: get("SELECT AVG(avg_rating) a FROM provider_profiles WHERE review_count > 0").a || 0,
      newUsersLast7d: get("SELECT COUNT(*) c FROM users WHERE created_at >= datetime('now','-7 days') AND role != 'admin'").c,
      newProvidersLast7d: get("SELECT COUNT(*) c FROM users WHERE created_at >= datetime('now','-7 days') AND role = 'provider'").c,
    };
    return { status: 200, body: stats };
  }));

  router.get('/api/admin/users', requireAuth(['admin'])(async (req, res, ctx) => {
    const role = ctx.query.role;
    let sql = "SELECT id, full_name, phone, email, role, status, created_at FROM users WHERE role != 'admin'";
    const params = [];
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    return { status: 200, body: all(sql, params) };
  }));

  router.post('/api/admin/users/:id/suspend', requireAuth(['admin'])(async (req, res, ctx) => {
    run("UPDATE users SET status='SUSPENDED' WHERE id=?", [ctx.params.id]);
    logAdminAction(ctx.user.id, 'SUSPEND_USER', 'user', ctx.params.id, ctx.body.reason);
    return { status: 200, body: { ok: true } };
  }));

  router.post('/api/admin/users/:id/unsuspend', requireAuth(['admin'])(async (req, res, ctx) => {
    run("UPDATE users SET status='ACTIVE' WHERE id=?", [ctx.params.id]);
    logAdminAction(ctx.user.id, 'UNSUSPEND_USER', 'user', ctx.params.id);
    return { status: 200, body: { ok: true } };
  }));

  router.delete('/api/admin/users/:id', requireAuth(['admin'])(async (req, res, ctx) => {
    run("UPDATE users SET status='DELETED' WHERE id=?", [ctx.params.id]);
    logAdminAction(ctx.user.id, 'DELETE_USER', 'user', ctx.params.id, ctx.body.reason);
    return { status: 200, body: { ok: true } };
  }));

  router.get('/api/admin/providers', requireAuth(['admin'])(async (req, res, ctx) => {
    const status = ctx.query.verificationStatus;
    let sql = `SELECT pp.*, u.full_name, u.phone, u.status as user_status FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND pp.verification_status = ?'; params.push(status); }
    sql += ' ORDER BY pp.created_at DESC LIMIT 500';
    return { status: 200, body: all(sql, params) };
  }));

  router.post('/api/admin/providers/:id/feature', requireAuth(['admin'])(async (req, res, ctx) => {
    run('UPDATE provider_profiles SET featured=? WHERE id=?', [ctx.body.featured ? 1 : 0, ctx.params.id]);
    logAdminAction(ctx.user.id, ctx.body.featured ? 'FEATURE_PROVIDER' : 'UNFEATURE_PROVIDER', 'provider', ctx.params.id);
    return { status: 200, body: { ok: true } };
  }));

  router.get('/api/admin/audit-log', requireAuth(['admin'])(async (req, res, ctx) => {
    const rows = all(
      `SELECT aa.*, u.full_name as admin_name FROM admin_actions aa JOIN users u ON u.id = aa.admin_id
       ORDER BY aa.created_at DESC LIMIT 300`
    );
    return { status: 200, body: rows };
  }));

  router.get('/api/admin/jobs', requireAuth(['admin'])(async (req, res, ctx) => {
    const { serializeRequest } = require('./requests');
    let sql = 'SELECT * FROM requests WHERE 1=1';
    const params = [];
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(ctx.query.status); }
    sql += ' ORDER BY created_at DESC LIMIT 300';
    return { status: 200, body: all(sql, params).map(serializeRequest) };
  }));
}

module.exports = register;
