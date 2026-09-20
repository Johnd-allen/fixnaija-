import { api } from '../api.js';
import { renderChrome, esc, naira, statusPill, emptyState, skeletonCards, toast, requireLogin, openModal, closeModal } from '../components.js';
import { navigate } from '../router.js';

export async function renderAdminDashboard(root) {
  if (!requireLogin('admin')) return;
  root.innerHTML = `<div class="screen screen--wide"><h2>Admin dashboard</h2><div id="stats" style="margin-top:14px;">${skeletonCards(2)}</div></div>`;
  renderChrome(root, '/admin');
  try {
    const s = await api.get('/admin/stats');
    root.querySelector('#stats').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><b>${s.totalUsers}</b><span>total users</span></div>
        <div class="stat-card"><b>${s.totalProviders}</b><span>providers</span></div>
        <div class="stat-card"><b>${s.verifiedProviders}</b><span>verified providers</span></div>
        <div class="stat-card"><b>${s.pendingVerification}</b><span>pending verification</span></div>
        <div class="stat-card"><b>${s.completedJobs}</b><span>completed jobs</span></div>
        <div class="stat-card"><b>${s.activeJobs}</b><span>active jobs</span></div>
        <div class="stat-card"><b>${s.cancelledJobs}</b><span>cancelled jobs</span></div>
        <div class="stat-card"><b>${s.openDisputes}</b><span>open disputes</span></div>
        <div class="stat-card"><b>${s.openReports}</b><span>open reports</span></div>
        <div class="stat-card"><b>${s.avgPlatformRating ? s.avgPlatformRating.toFixed(2) : '—'}★</b><span>avg platform rating</span></div>
        <div class="stat-card"><b>${s.newUsersLast7d}</b><span>new users (7d)</span></div>
        <div class="stat-card"><b>${s.newProvidersLast7d}</b><span>new providers (7d)</span></div>
      </div>
      <div class="section-head"><h2>Manage</h2></div>
      <div class="card">
        <div class="list-row" data-goto="#/admin/verification"><div class="list-row__body"><b>🛡️ Verification queue</b></div></div>
        <div class="list-row" data-goto="#/admin/users"><div class="list-row__body"><b>👥 Users &amp; providers</b></div></div>
        <div class="list-row" data-goto="#/admin/reports"><div class="list-row__body"><b>🚩 Reports &amp; disputes</b></div></div>
        <div class="list-row" data-goto="#/admin/audit"><div class="list-row__body"><b>📜 Audit log</b></div></div>
      </div>`;
  } catch (e) {
    root.querySelector('#stats').innerHTML = emptyState('⚠️', 'Could not load stats', e.message);
  }
}

export async function renderAdminVerification(root) {
  if (!requireLogin('admin')) return;
  root.innerHTML = `<div class="screen"><h2>Verification queue</h2><div id="v-list" style="margin-top:14px;">${skeletonCards(3)}</div></div>`;
  renderChrome(root, '/admin/verification');

  async function load() {
    const list = root.querySelector('#v-list');
    try {
      const apps = await api.get('/admin/verification?status=PENDING');
      list.innerHTML = apps.length ? apps.map((a) => `
        <div class="card">
          <b>${esc(a.full_name)}</b> <span class="faint">(${esc(a.phone)})</span>
          <p class="muted" style="margin-top:4px;">Legal name: ${esc(a.full_legal_name)}</p>
          <p class="muted">Address: ${esc(a.address)}</p>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn--outline btn--sm" data-view="${a.id}">View documents</button>
            <button class="btn btn--primary btn--sm" data-approve="${a.id}">Approve</button>
            <button class="btn btn--danger btn--sm" data-reject="${a.id}">Reject</button>
          </div>
        </div>`).join('') : emptyState('🛡️', 'All caught up', 'No pending verification applications.');

      list.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => viewDocs(btn.dataset.view)));
      list.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', () => decide(btn.dataset.approve, 'VERIFIED')));
      list.querySelectorAll('[data-reject]').forEach((btn) => btn.addEventListener('click', () => decide(btn.dataset.reject, 'REJECTED')));
    } catch (e) {
      list.innerHTML = emptyState('⚠️', 'Could not load queue', e.message);
    }
  }

  async function viewDocs(id) {
    const app = await api.get(`/admin/verification/${id}`);
    openModal(`
      <h3>Verification documents</h3>
      <p class="muted">These are only visible to administrators.</p>
      <div class="photo-grid">${app.documents.map((d) => `<img src="${esc(d.path)}">`).join('')}</div>
    `);
  }

  async function decide(id, decision) {
    let notes;
    if (decision === 'REJECTED') {
      notes = prompt('Reason for rejection (shown to the provider):') || '';
    }
    try {
      await api.post(`/admin/verification/${id}/decide`, { decision, notes });
      toast(decision === 'VERIFIED' ? 'Provider verified' : 'Application rejected', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  load();
}

export async function renderAdminUsers(root) {
  if (!requireLogin('admin')) return;
  root.innerHTML = `
    <div class="screen">
      <h2>Users &amp; providers</h2>
      <div class="tabs" id="u-tabs">
        <div class="tab active" data-t="customer">Customers</div>
        <div class="tab" data-t="provider">Providers</div>
      </div>
      <div id="u-list">${skeletonCards(4)}</div>
    </div>`;
  renderChrome(root, '/admin');

  async function load(role) {
    const list = root.querySelector('#u-list');
    list.innerHTML = skeletonCards(4);
    const rows = await api.get(`/admin/users?role=${role}`);
    list.innerHTML = rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>
      ${rows.map((u) => `<tr>
        <td>${esc(u.full_name)}</td><td>${esc(u.phone)}</td>
        <td><span class="pill ${u.status === 'ACTIVE' ? 'pill--available' : 'pill--busy'}">${esc(u.status)}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          ${u.status === 'ACTIVE'
            ? `<button class="btn btn--sm btn--danger" data-suspend="${u.id}">Suspend</button>`
            : `<button class="btn btn--sm btn--outline" data-unsuspend="${u.id}">Unsuspend</button>`}
        </td>
      </tr>`).join('')}
      </tbody></table></div>` : emptyState('👥', 'No users yet', '');

    list.querySelectorAll('[data-suspend]').forEach((btn) => btn.addEventListener('click', async () => {
      const reason = prompt('Reason for suspension:');
      await api.post(`/admin/users/${btn.dataset.suspend}/suspend`, { reason });
      toast('User suspended', 'success'); load(role);
    }));
    list.querySelectorAll('[data-unsuspend]').forEach((btn) => btn.addEventListener('click', async () => {
      await api.post(`/admin/users/${btn.dataset.unsuspend}/unsuspend`);
      toast('User reinstated', 'success'); load(role);
    }));
  }

  root.querySelectorAll('#u-tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
    root.querySelectorAll('#u-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    load(tab.dataset.t);
  }));
  load('customer');
}

export async function renderAdminReports(root) {
  if (!requireLogin('admin')) return;
  root.innerHTML = `
    <div class="screen">
      <h2>Reports &amp; disputes</h2>
      <div class="tabs" id="r-tabs">
        <div class="tab active" data-t="reports">User reports</div>
        <div class="tab" data-t="disputes">Job disputes</div>
        <div class="tab" data-t="reviews">Flagged reviews</div>
      </div>
      <div id="r-list">${skeletonCards(3)}</div>
    </div>`;
  renderChrome(root, '/admin/reports');

  async function loadReports() {
    const rows = await api.get('/admin/reports?status=OPEN');
    root.querySelector('#r-list').innerHTML = rows.length ? rows.map((r) => `
      <div class="card">
        <b>${esc(r.reason.replace(/_/g, ' '))}</b>
        <p class="muted" style="margin-top:4px;">Reported by ${esc(r.reporter_name)}${r.reported_name ? ' about ' + esc(r.reported_name) : ''}</p>
        ${r.description ? `<p style="margin-top:6px;">${esc(r.description)}</p>` : ''}
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn--primary btn--sm" data-resolve="${r.id}">Resolve</button>
          <button class="btn btn--ghost btn--sm" data-dismiss="${r.id}">Dismiss</button>
        </div>
      </div>`).join('') : emptyState('🚩', 'No open reports', 'Nice and quiet.');
    root.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', () => resolveReport(b.dataset.resolve, 'RESOLVED')));
    root.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => resolveReport(b.dataset.dismiss, 'DISMISSED')));
  }
  async function resolveReport(id, status) {
    const adminNotes = prompt('Notes (optional):') || '';
    await api.post(`/admin/reports/${id}/resolve`, { status, adminNotes });
    toast('Report updated', 'success'); loadReports();
  }

  async function loadDisputes() {
    const rows = await api.get('/admin/disputes?status=OPEN');
    root.querySelector('#r-list').innerHTML = rows.length ? rows.map((d) => `
      <div class="card" data-goto="#/requests/${d.request_id}">
        <b>Dispute by ${esc(d.raised_by_name)}</b>
        <p style="margin-top:6px;">${esc(d.reason)}</p>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn--primary btn--sm" data-resolve="${d.id}">Mark resolved</button>
          <button class="btn btn--ghost btn--sm" data-dismiss="${d.id}">Dismiss</button>
        </div>
      </div>`).join('') : emptyState('⚖️', 'No open disputes', '');
    root.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); resolveDispute(b.dataset.resolve, 'RESOLVED'); }));
    root.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); resolveDispute(b.dataset.dismiss, 'DISMISSED'); }));
  }
  async function resolveDispute(id, status) {
    const resolutionNotes = prompt('Resolution notes:') || '';
    await api.post(`/admin/disputes/${id}/resolve`, { status, resolutionNotes });
    toast('Dispute updated', 'success'); loadDisputes();
  }

  async function loadFlaggedReviews() {
    const rows = await api.get('/admin/review-reports?status=OPEN');
    root.querySelector('#r-list').innerHTML = rows.length ? rows.map((r) => `
      <div class="card">
        <p>${esc(r.comment || '(no written review)')}</p>
        <p class="faint" style="margin-top:4px;">Reported: ${esc(r.reason)}</p>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn--danger btn--sm" data-hide="${r.review_id}">Hide review</button>
          <button class="btn btn--ghost btn--sm" data-keep="${r.review_id}">Keep review</button>
        </div>
      </div>`).join('') : emptyState('⭐', 'No flagged reviews', '');
    root.querySelectorAll('[data-hide]').forEach((b) => b.addEventListener('click', async () => { await api.post(`/admin/reviews/${b.dataset.hide}/moderate`, { action: 'HIDE' }); toast('Review hidden', 'success'); loadFlaggedReviews(); }));
    root.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', async () => { await api.post(`/admin/reviews/${b.dataset.keep}/moderate`, { action: 'RESTORE' }); toast('Review kept', 'success'); loadFlaggedReviews(); }));
  }

  const loaders = { reports: loadReports, disputes: loadDisputes, reviews: loadFlaggedReviews };
  root.querySelectorAll('#r-tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
    root.querySelectorAll('#r-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    loaders[tab.dataset.t]();
  }));
  loadReports();
}

export async function renderAdminAudit(root) {
  if (!requireLogin('admin')) return;
  root.innerHTML = `<div class="screen"><h2>Audit log</h2><div id="a-list" style="margin-top:14px;">${skeletonCards(4)}</div></div>`;
  renderChrome(root, '/admin');
  try {
    const rows = await api.get('/admin/audit-log');
    root.querySelector('#a-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Admin</th><th>Action</th><th>When</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.admin_name)}</td><td>${esc(r.action)}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('📜', 'No admin actions yet', '');
  } catch (e) {
    root.querySelector('#a-list').innerHTML = emptyState('⚠️', 'Could not load audit log', e.message);
  }
}
