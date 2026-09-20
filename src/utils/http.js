const fs = require('fs');
const path = require('path');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) { // 25MB cap (covers base64 images/docs)
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `fixnaija_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`);
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'fixnaija_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, rootDir) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(rootDir, urlPath));
  if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end('Forbidden'); return true; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// Saves a base64 data payload ("data:image/png;base64,....") to disk under uploadsDir/subdir
function saveBase64File(uploadsDir, subdir, base64Data, fallbackExt = 'bin') {
  const dir = path.join(uploadsDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  let ext = fallbackExt;
  let raw = base64Data;
  const match = /^data:(.+);base64,(.*)$/.exec(base64Data);
  if (match) {
    const mimeType = match[1];
    raw = match[2];
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('pdf')) ext = 'pdf';
  }
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(raw, 'base64'));
  return `/uploads/${subdir}/${name}`;
}

module.exports = { readBody, parseCookies, sendJson, setAuthCookie, clearAuthCookie, serveStatic, saveBase64File };
