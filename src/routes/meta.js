const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logAdminAction } = require('../utils/audit');

function register(router) {
  router.get('/api/categories', async () => {
    const rows = all('SELECT * FROM service_categories WHERE active = 1 ORDER BY name');
    return { status: 200, body: rows };
  });

  router.get('/api/locations/states', async () => {
    const rows = all('SELECT DISTINCT state FROM locations ORDER BY state');
    return { status: 200, body: rows.map((r) => r.state) };
  });

  router.get('/api/locations/cities', async (req, res, ctx) => {
    const state = ctx.query.state;
    if (!state) return { status: 400, body: { error: 'state query param required' } };
    const rows = all('SELECT DISTINCT city FROM locations WHERE state = ? ORDER BY city', [state]);
    return { status: 200, body: rows.map((r) => r.city) };
  });

  router.get('/api/locations', async (req, res, ctx) => {
    const { state, city } = ctx.query;
    let sql = 'SELECT * FROM locations WHERE 1=1';
    const params = [];
    if (state) { sql += ' AND state = ?'; params.push(state); }
    if (city) { sql += ' AND city = ?'; params.push(city); }
    sql += ' ORDER BY state, city, area';
    return { status: 200, body: all(sql, params) };
  });

  // ---- admin management ----
  router.post('/api/admin/categories', requireAuth(['admin'])(async (req, res, ctx) => {
    const { name, icon } = ctx.body;
    if (!name) return { status: 400, body: { error: 'name is required' } };
    const id = uuid();
    run('INSERT INTO service_categories (id, name, icon) VALUES (?,?,?)', [id, name, icon || '🛠️']);
    logAdminAction(ctx.user.id, 'CREATE_CATEGORY', 'category', id);
    return { status: 201, body: get('SELECT * FROM service_categories WHERE id = ?', [id]) };
  }));

  router.patch('/api/admin/categories/:id', requireAuth(['admin'])(async (req, res, ctx) => {
    const cat = get('SELECT * FROM service_categories WHERE id = ?', [ctx.params.id]);
    if (!cat) return { status: 404, body: { error: 'Category not found' } };
    const active = ctx.body.active === undefined ? cat.active : (ctx.body.active ? 1 : 0);
    const name = ctx.body.name || cat.name;
    run('UPDATE service_categories SET name=?, active=? WHERE id=?', [name, active, cat.id]);
    logAdminAction(ctx.user.id, 'UPDATE_CATEGORY', 'category', cat.id);
    return { status: 200, body: get('SELECT * FROM service_categories WHERE id = ?', [cat.id]) };
  }));

  router.post('/api/admin/locations', requireAuth(['admin'])(async (req, res, ctx) => {
    const { state, city, area, lat, lng } = ctx.body;
    if (!state || !city) return { status: 400, body: { error: 'state and city are required' } };
    const id = uuid();
    run('INSERT INTO locations (id, state, city, area, lat, lng) VALUES (?,?,?,?,?,?)', [id, state, city, area || null, lat || null, lng || null]);
    logAdminAction(ctx.user.id, 'CREATE_LOCATION', 'location', id);
    return { status: 201, body: get('SELECT * FROM locations WHERE id = ?', [id]) };
  }));
}

module.exports = register;
