// Minimal router (no external deps). Supports :param segments and async handlers.
class Router {
  constructor() {
    this.routes = []; // { method, segments, handler }
  }

  _add(method, urlPattern, handler) {
    const segments = urlPattern.split('/').filter(Boolean);
    this.routes.push({ method, segments, handler });
  }

  get(p, h) { this._add('GET', p, h); }
  post(p, h) { this._add('POST', p, h); }
  put(p, h) { this._add('PUT', p, h); }
  patch(p, h) { this._add('PATCH', p, h); }
  delete(p, h) { this._add('DELETE', p, h); }

  match(method, urlPath) {
    const pathSegments = urlPath.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== pathSegments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const rs = route.segments[i];
        const ps = pathSegments[i];
        if (rs.startsWith(':')) {
          params[rs.slice(1)] = decodeURIComponent(ps);
        } else if (rs !== ps) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = Router;
