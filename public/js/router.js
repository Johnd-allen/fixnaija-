const routes = []; // { pattern: RegExp, keys: [], render: fn }

export function addRoute(path, render) {
  const keys = [];
  const pattern = new RegExp(
    '^' + path.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ pattern, keys, render });
}

export function navigate(hash) {
  if (location.hash === hash) { handleRoute(); return; }
  location.hash = hash;
}

let mountEl = null;
export function initRouter(el) {
  mountEl = el;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

async function handleRoute() {
  const raw = (location.hash || '#/').slice(1) || '/';
  const [pathPart, queryPart] = raw.split('?');
  const query = {};
  if (queryPart) new URLSearchParams(queryPart).forEach((v, k) => { query[k] = v; });

  for (const r of routes) {
    const m = r.pattern.exec(pathPart);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      mountEl.scrollTop = 0;
      window.scrollTo(0, 0);
      try {
        await r.render(mountEl, params, query);
      } catch (err) {
        console.error(err);
        mountEl.innerHTML = `<div class="screen"><div class="state-block"><div class="glyph">⚠️</div><h3>Something went wrong</h3><p>${err.message || 'Please try again.'}</p></div></div>`;
      }
      return;
    }
  }
  mountEl.innerHTML = `<div class="screen"><div class="state-block"><div class="glyph">🔍</div><h3>Page not found</h3></div></div>`;
}
