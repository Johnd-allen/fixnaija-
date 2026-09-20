import { api } from '../api.js';
import { state } from '../state.js';
import { renderChrome, statusPill, naira, esc, timeAgo, emptyState, skeletonCards, requireLogin } from '../components.js';
import { navigate } from '../router.js';

const TABS = [
  { key: '', label: 'All' },
  { key: 'REQUESTED', label: 'New' },
  { key: 'ACCEPTED', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export async function renderRequests(root, params, query) {
  if (!requireLogin()) return;
  const isProvider = state.user.role === 'provider';
  root.innerHTML = `
    <div class="screen">
      <h2>${isProvider ? 'Job requests' : 'My requests'}</h2>
      <div class="tabs" id="req-tabs" style="margin-top:14px;">
        ${TABS.map((t) => `<div class="tab ${(!query.status && !t.key) || query.status === t.key ? 'active' : ''}" data-status="${t.key}">${t.label}</div>`).join('')}
      </div>
      <div id="req-list">${skeletonCards(3)}</div>
    </div>`;
  renderChrome(root, '/requests');

  async function load(status) {
    const listEl = root.querySelector('#req-list');
    listEl.innerHTML = skeletonCards(3);
    try {
      const rows = await api.get('/requests/mine' + (status ? `?status=${status}` : ''));
      if (!listEl.isConnected) return;
      if (!rows.length) {
        listEl.innerHTML = emptyState('🧾', 'No requests here', isProvider ? 'New job requests from customers will show up here.' : 'Find a professional and request a service to get started.');
        return;
      }
      listEl.innerHTML = rows.map((r) => `
        <div class="card" data-goto="#/requests/${r.id}" style="cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <b>${esc(r.category.icon)} ${esc(r.category.name)}</b>
              <p class="muted" style="margin-top:4px;">${esc(isProvider ? r.customer.full_name : (r.provider.business_name || r.provider.full_name))}</p>
            </div>
            ${statusPill(r.status)}
          </div>
          <p style="margin-top:8px;">${esc(r.description.slice(0, 100))}${r.description.length > 100 ? '…' : ''}</p>
          <div style="display:flex;justify-content:space-between;margin-top:8px;" class="faint">
            <span>${timeAgo(r.createdAt)}</span>
            <span>${r.agreedPrice ? naira(r.agreedPrice) : 'Price not agreed'}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      listEl.innerHTML = emptyState('⚠️', 'Could not load requests', e.message);
    }
  }

  root.querySelectorAll('#req-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('#req-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      navigate(`#/requests${tab.dataset.status ? '?status=' + tab.dataset.status : ''}`);
      load(tab.dataset.status);
    });
  });

  load(query.status || '');
}
