import { state, logout } from './state.js';
import { navigate } from './router.js';

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function naira(amount) {
  if (amount === null || amount === undefined) return '—';
  return '₦' + Number(amount).toLocaleString('en-NG');
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function toast(message, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function starsDisplay(rating) {
  const r = Math.round(Number(rating) || 0);
  return `<span class="stars">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
}

export function verifiedBadge(status) {
  if (status !== 'VERIFIED') return '';
  return `<span class="badge-verified">Verified Professional</span>`;
}

export function availabilityPill(av) {
  const map = { AVAILABLE: ['pill--available', 'Available now'], BUSY: ['pill--busy', 'Busy'], OFFLINE: ['pill--offline', 'Offline'] };
  const [cls, label] = map[av] || map.OFFLINE;
  return `<span class="pill ${cls}">${label}</span>`;
}

export function statusPill(status) {
  const labels = {
    REQUESTED: 'Requested', ACCEPTED: 'Accepted', REJECTED: 'Declined', ON_THE_WAY: 'On the way',
    ARRIVED: 'Arrived', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
  };
  return `<span class="status-pill status-${status}">${labels[status] || status}</span>`;
}

export function providerCardHtml(p) {
  const photo = p.profilePhoto
    ? `<img src="${esc(p.profilePhoto)}" alt="">`
    : (p.categories && p.categories[0] ? p.categories[0].icon : '🛠️');
  const loc = p.location ? `${p.location.area ? p.location.area + ', ' : ''}${p.location.city}` : 'Location not set';
  return `
  <div class="provider-card" data-goto="#/provider/${p.id}">
    <div class="provider-card__photo">${photo}</div>
    <div class="provider-card__body">
      <div class="provider-card__top">
        <span class="provider-card__name">${esc(p.name)}</span>
        ${verifiedBadge(p.verificationStatus)}
        ${p.featured ? '<span class="badge-sponsored">Sponsored</span>' : ''}
      </div>
      <div class="provider-card__meta">${esc((p.categories || []).map((c) => c.name).join(', ') || 'Service provider')} · ${esc(loc)}</div>
      <div class="provider-card__stats">
        <span>${starsDisplay(p.avgRating)} ${p.avgRating ? p.avgRating.toFixed(1) : '—'} (${p.reviewCount})</span>
        <span>${p.completedJobs} jobs</span>
        <span>${p.yearsExperience}yrs exp</span>
      </div>
      <div class="provider-card__stats">
        <span class="provider-card__price">From ${naira(p.startingPrice)}</span>
        ${availabilityPill(p.availability)}
      </div>
    </div>
  </div>`;
}

export function ratingDistributionHtml(dist, total) {
  return [5, 4, 3, 2, 1].map((star) => {
    const count = dist[star] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `<div class="rating-bar-row"><span>${star} ★</span><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div><span>${count}</span></div>`;
  }).join('');
}

const JOB_STEPS = ['REQUESTED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
const JOB_LABELS = { REQUESTED: 'Requested', ACCEPTED: 'Accepted', ON_THE_WAY: 'On the way', ARRIVED: 'Arrived', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
export function jobTimelineHtml(request) {
  if (request.status === 'CANCELLED' || request.status === 'REJECTED' || request.status === 'DISPUTED') {
    return `<div class="warning-box">This job is <b>${request.status.toLowerCase()}</b>. ${esc(request.history[request.history.length - 1]?.note || '')}</div>`;
  }
  const currentIdx = JOB_STEPS.indexOf(request.status);
  return `<div class="timeline">${JOB_STEPS.map((s, i) => {
    const done = i <= currentIdx;
    const histEntry = request.history.find((h) => h.status === s);
    return `<div class="timeline-step ${done ? 'done' : ''}">
      <div class="dotwrap"><div class="dot">${done ? '✓' : ''}</div>${i < JOB_STEPS.length - 1 ? '<div class="line"></div>' : ''}</div>
      <div class="content"><b>${JOB_LABELS[s]}</b><span>${histEntry ? timeAgo(histEntry.created_at) : 'Pending'}</span></div>
    </div>`;
  }).join('')}</div>`;
}

export function starInputHtml(name, value = 0) {
  return `<div class="star-input" data-star-input="${name}">${[1, 2, 3, 4, 5].map((n) => `<span data-val="${n}" class="${n <= value ? 'filled' : ''}">★</span>`).join('')}</div>`;
}
export function wireStarInputs(container) {
  container.querySelectorAll('[data-star-input]').forEach((wrap) => {
    wrap.querySelectorAll('span').forEach((span) => {
      span.addEventListener('click', () => {
        const val = Number(span.dataset.val);
        wrap.dataset.value = val;
        wrap.querySelectorAll('span').forEach((s) => s.classList.toggle('filled', Number(s.dataset.val) <= val));
      });
    });
  });
}
export function starInputValues(container) {
  const out = {};
  container.querySelectorAll('[data-star-input]').forEach((wrap) => {
    out[wrap.dataset.starInput] = Number(wrap.dataset.value || 0);
  });
  return out;
}

export function emptyState(glyph, title, body) {
  return `<div class="state-block"><div class="glyph">${glyph}</div><h3>${esc(title)}</h3><p>${esc(body || '')}</p></div>`;
}

export function skeletonCards(n = 3) {
  return Array.from({ length: n }).map(() => `<div class="skeleton" style="height:96px;margin-bottom:12px;"></div>`).join('');
}

// ---- Modal sheet ----
export function openModal(innerHtml) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';
  backdrop.innerHTML = `<div class="modal-sheet"><div class="modal-sheet__handle"></div>${innerHtml}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  return backdrop;
}
export function closeModal() {
  const existing = document.getElementById('active-modal');
  if (existing) existing.remove();
}

// ---- Chrome: topbar + bottom nav ----
export function renderChrome(root, activeRoute) {
  const notifDot = state.unreadNotifications > 0 ? '<span class="dot"></span>' : '';
  root.querySelector('#topbar-slot')?.remove();
  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <a href="#/" class="topbar__brand"><span class="mark">FN</span> FixNaija</a>
    <div class="topbar__actions">
      ${state.user ? `<a class="icon-btn" href="#/notifications" title="Notifications">🔔${notifDot}</a>` : `<a class="icon-btn" href="#/login" title="Log in">👤</a>`}
    </div>`;
  root.prepend(topbar);

  const items = navItemsForRole(state.user?.role);
  const nav = document.createElement('nav');
  nav.className = 'bottomnav';
  nav.innerHTML = items.map((it) => `
    <a class="bottomnav__item ${activeRoute === it.route ? 'active' : ''}" href="#${it.route}">
      <span class="glyph">${it.glyph}</span>${it.label}
    </a>`).join('');
  root.appendChild(nav);
}

function navItemsForRole(role) {
  if (role === 'admin') {
    return [
      { route: '/admin', glyph: '📊', label: 'Dashboard' },
      { route: '/admin/verification', glyph: '🛡️', label: 'Verify' },
      { route: '/admin/reports', glyph: '🚩', label: 'Reports' },
      { route: '/messages', glyph: '💬', label: 'Messages' },
      { route: '/profile', glyph: '👤', label: 'Profile' },
    ];
  }
  if (role === 'provider') {
    return [
      { route: '/', glyph: '🏠', label: 'Home' },
      { route: '/requests', glyph: '🧰', label: 'Jobs' },
      { route: '/messages', glyph: '💬', label: 'Messages' },
      { route: '/profile', glyph: '👤', label: 'Profile' },
    ];
  }
  return [
    { route: '/', glyph: '🏠', label: 'Home' },
    { route: '/search', glyph: '🔎', label: 'Search' },
    { route: '/requests', glyph: '🧾', label: 'Requests' },
    { route: '/messages', glyph: '💬', label: 'Messages' },
    { route: '/profile', glyph: '👤', label: 'Profile' },
  ];
}

// Delegate click on any [data-goto] element to SPA navigation
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-goto]');
  if (el) navigate(el.dataset.goto);
});

export function requireLogin(role) {
  if (!state.user) { navigate('#/login'); return false; }
  if (role && state.user.role !== role) { toast('That page is not available for your account type.', 'error'); navigate('#/'); return false; }
  return true;
}

export { logout };
