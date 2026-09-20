const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Minimal .env loader (no external dependency available/needed).
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  });
})();

const Router = require('./src/router');
const { readBody, sendJson, serveStatic } = require('./src/utils/http');

const router = new Router();

require('./src/routes/auth')(router);
require('./src/routes/meta')(router);
require('./src/routes/providers').register(router);
require('./src/routes/verification')(router);
require('./src/routes/requests').register(router);
require('./src/routes/reviews')(router);
require('./src/routes/messages')(router);
require('./src/routes/misc')(router);
require('./src/routes/admin')(router);

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) return sendJson(res, 404, { error: 'Not found' });

      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          body = await readBody(req);
        } catch (e) {
          return sendJson(res, 413, { error: 'Payload too large' });
        }
      }
      const ctx = { params: match.params, query: parsed.query, body };
      const result = await match.handler(req, res, ctx);
      if (res.writableEnded) return; // handler already streamed a response
      if (result) return sendJson(res, result.status || 200, result.body);
      return sendJson(res, 200, {});
    }

    // static assets (SPA shell + uploads)
    const served = serveStatic(req, res, PUBLIC_DIR);
    if (served) return;

    // SPA fallback: any non-API, non-file route serves index.html
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.writableEnded) sendJson(res, 500, { error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FixNaija server running at http://localhost:${PORT}`);
});
