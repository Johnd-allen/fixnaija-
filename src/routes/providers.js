const path = require('path');
const { get, run, all, uuid } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveBase64File } = require('../utils/http');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

function serializeProvider(p) {
  const user = get('SELECT full_name, phone FROM users WHERE id = ?', [p.user_id]);
  const location = p.location_id ? get('SELECT * FROM locations WHERE id = ?', [p.location_id]) : null;
  const categories = all(
    `SELECT sc.id, sc.name, sc.icon FROM provider_services ps
     JOIN service_categories sc ON sc.id = ps.category_id WHERE ps.provider_id = ?`,
    [p.id]
  );
  const areas = all(
    `SELECT l.* FROM provider_areas pa JOIN locations l ON l.id = pa.location_id WHERE pa.provider_id = ?`,
    [p.id]
  );
  const portfolio = all('SELECT id, path, caption FROM portfolio_photos WHERE provider_id = ? ORDER BY created_at DESC', [p.id]);
  return {
    id: p.id,
    userId: p.user_id,
    name: p.business_name || user.full_name,
    phone: user.phone,
    bio: p.bio,
    yearsExperience: p.years_experience,
    startingPrice: p.starting_price,
    maxPrice: p.max_price,
    profilePhoto: p.profile_photo,
    location,
    whatsapp: p.whatsapp,
    openingHours: p.opening_hours,
    socialLinks: p.social_links,
    availability: p.availability,
    verificationStatus: p.verification_status,
    avgRating: p.avg_rating,
    reviewCount: p.review_count,
    completedJobs: p.completed_jobs,
    responseRate: p.response_rate,
    featured: !!p.featured,
    categories,
    areas,
    portfolio,
    createdAt: p.created_at,
  };
}

function register(router) {
  // ---- Public search ----
  router.get('/api/providers', async (req, res, ctx) => {
    const q = ctx.query;
    let sql = `SELECT DISTINCT pp.* FROM provider_profiles pp
      LEFT JOIN provider_services ps ON ps.provider_id = pp.id
      LEFT JOIN locations l ON l.id = pp.location_id
      WHERE 1=1`;
    const params = [];

    if (q.category) { sql += ' AND ps.category_id = ?'; params.push(q.category); }
    if (q.state) { sql += ' AND l.state = ?'; params.push(q.state); }
    if (q.city) { sql += ' AND l.city = ?'; params.push(q.city); }
    if (q.area) { sql += ' AND l.area = ?'; params.push(q.area); }
    if (q.verifiedOnly === 'true') { sql += " AND pp.verification_status = 'VERIFIED'"; }
    if (q.availability === 'true') { sql += " AND pp.availability = 'AVAILABLE'"; }
    if (q.minRating) { sql += ' AND pp.avg_rating >= ?'; params.push(Number(q.minRating)); }
    if (q.minExperience) { sql += ' AND pp.years_experience >= ?'; params.push(Number(q.minExperience)); }
    if (q.maxPrice) { sql += ' AND pp.starting_price <= ?'; params.push(Number(q.maxPrice)); }
    if (q.search) {
      sql += ' AND (pp.business_name LIKE ? OR EXISTS (SELECT 1 FROM users u WHERE u.id = pp.user_id AND u.full_name LIKE ?))';
      params.push(`%${q.search}%`, `%${q.search}%`);
    }
    // Only show profiles belonging to active, non-deleted provider users
    sql += " AND EXISTS (SELECT 1 FROM users u WHERE u.id = pp.user_id AND u.status = 'ACTIVE')";

    const sortMap = {
      rating: 'pp.avg_rating DESC',
      experience: 'pp.years_experience DESC',
      price: 'pp.starting_price ASC',
      jobs: 'pp.completed_jobs DESC',
      newest: 'pp.created_at DESC',
    };
    sql += ' ORDER BY ' + (sortMap[q.sort] || 'pp.featured DESC, pp.avg_rating DESC');

    let rows = all(sql, params);
    // sponsored/featured must be explicitly labeled -- enforced client-side via `featured` flag
    const results = rows.map(serializeProvider);
    return { status: 200, body: results };
  });

  router.get('/api/providers/:id', async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE id = ?', [ctx.params.id]);
    if (!p) return { status: 404, body: { error: 'Provider not found' } };
    return { status: 200, body: serializeProvider(p) };
  });

  router.get('/api/providers/:id/reviews', async (req, res, ctx) => {
    const reviews = all(
      `SELECT r.*, u.full_name as customer_name FROM reviews r
       JOIN users u ON u.id = r.customer_id
       WHERE r.provider_id = ? AND r.status = 'PUBLISHED' ORDER BY r.created_at DESC`,
      [ctx.params.id]
    );
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => { dist[r.overall] = (dist[r.overall] || 0) + 1; });
    return { status: 200, body: { reviews, distribution: dist } };
  });

  // ---- Provider self-service (requires provider role) ----
  router.get('/api/me/provider-profile', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    if (!p) return { status: 404, body: { error: 'Provider profile not found' } };
    return { status: 200, body: serializeProvider(p) };
  }));

  router.patch('/api/me/provider-profile', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    if (!p) return { status: 404, body: { error: 'Provider profile not found' } };
    const b = ctx.body;
    const locationId = b.locationId !== undefined ? b.locationId : p.location_id;
    run(
      `UPDATE provider_profiles SET business_name=?, bio=?, years_experience=?, starting_price=?, max_price=?,
       location_id=?, whatsapp=?, opening_hours=?, social_links=?, availability=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        b.businessName ?? p.business_name,
        b.bio ?? p.bio,
        b.yearsExperience ?? p.years_experience,
        b.startingPrice ?? p.starting_price,
        b.maxPrice ?? p.max_price,
        locationId,
        b.whatsapp ?? p.whatsapp,
        b.openingHours ?? p.opening_hours,
        b.socialLinks ?? p.social_links,
        b.availability ?? p.availability,
        p.id,
      ]
    );
    return { status: 200, body: serializeProvider(get('SELECT * FROM provider_profiles WHERE id = ?', [p.id])) };
  }));

  router.post('/api/me/provider-profile/categories', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    const { categoryIds } = ctx.body;
    if (!Array.isArray(categoryIds)) return { status: 400, body: { error: 'categoryIds array required' } };
    run('DELETE FROM provider_services WHERE provider_id = ?', [p.id]);
    for (const catId of categoryIds) {
      run('INSERT OR IGNORE INTO provider_services (id, provider_id, category_id) VALUES (?,?,?)', [uuid(), p.id, catId]);
    }
    return { status: 200, body: serializeProvider(get('SELECT * FROM provider_profiles WHERE id = ?', [p.id])) };
  }));

  router.post('/api/me/provider-profile/areas', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    const { locationIds } = ctx.body;
    if (!Array.isArray(locationIds)) return { status: 400, body: { error: 'locationIds array required' } };
    run('DELETE FROM provider_areas WHERE provider_id = ?', [p.id]);
    for (const locId of locationIds) {
      run('INSERT OR IGNORE INTO provider_areas (id, provider_id, location_id) VALUES (?,?,?)', [uuid(), p.id, locId]);
    }
    return { status: 200, body: serializeProvider(get('SELECT * FROM provider_profiles WHERE id = ?', [p.id])) };
  }));

  router.post('/api/me/provider-profile/photo', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    const { imageBase64 } = ctx.body;
    if (!imageBase64) return { status: 400, body: { error: 'imageBase64 required' } };
    const relPath = saveBase64File(UPLOADS_DIR, `providers/${p.id}`, imageBase64, 'jpg');
    run('UPDATE provider_profiles SET profile_photo=? WHERE id=?', [relPath, p.id]);
    return { status: 200, body: { profilePhoto: relPath } };
  }));

  router.post('/api/me/provider-profile/portfolio', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    const { imageBase64, caption } = ctx.body;
    if (!imageBase64) return { status: 400, body: { error: 'imageBase64 required' } };
    const relPath = saveBase64File(UPLOADS_DIR, `portfolio/${p.id}`, imageBase64, 'jpg');
    const id = uuid();
    run('INSERT INTO portfolio_photos (id, provider_id, path, caption) VALUES (?,?,?,?)', [id, p.id, relPath, caption || null]);
    return { status: 201, body: { id, path: relPath, caption } };
  }));

  router.delete('/api/me/provider-profile/portfolio/:photoId', requireAuth(['provider'])(async (req, res, ctx) => {
    const p = get('SELECT * FROM provider_profiles WHERE user_id = ?', [ctx.user.id]);
    run('DELETE FROM portfolio_photos WHERE id = ? AND provider_id = ?', [ctx.params.photoId, p.id]);
    return { status: 200, body: { ok: true } };
  }));
}

module.exports = { register, serializeProvider };
