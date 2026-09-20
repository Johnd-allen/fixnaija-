import { api } from '../api.js';
import { refreshNotificationCount } from '../state.js';
import { renderChrome, esc, timeAgo, emptyState, skeletonCards, requireLogin } from '../components.js';

const ICONS = {
  NEW_REQUEST: '🧾', JOB_ACCEPTED: '✅', JOB_REJECTED: '❌', JOB_ON_THE_WAY: '🚗', JOB_ARRIVED: '📍',
  JOB_IN_PROGRESS: '🔧', JOB_COMPLETED: '🎉', JOB_CANCELLED: '⚠️', JOB_DISPUTED: '⚖️',
  NEW_MESSAGE: '💬', NEW_REVIEW: '⭐', VERIFICATION_APPROVED: '🛡️', VERIFICATION_REJECTED: '🛑',
};

export async function renderNotifications(root) {
  if (!requireLogin()) return;
  root.innerHTML = `
    <div class="screen">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2>Notifications</h2>
        <button class="btn btn--ghost btn--sm" id="mark-all">Mark all read</button>
      </div>
      <div id="notif-list" style="margin-top:12px;">${skeletonCards(4)}</div>
    </div>`;
  renderChrome(root, '/notifications');

  try {
    const rows = await api.get('/notifications');
    root.querySelector('#notif-list').innerHTML = rows.length ? rows.map((n) => `
      <div class="list-row" style="cursor:default;${n.read_at ? '' : 'background:var(--green-pale);border-radius:10px;padding-left:8px;'}">
        <div class="list-row__avatar" style="background:var(--gold-pale);">${ICONS[n.type] || '🔔'}</div>
        <div class="list-row__body">
          <b>${esc(n.title)}</b>
          <p style="white-space:normal;">${esc(n.body || '')}</p>
        </div>
        <div class="faint">${timeAgo(n.created_at)}</div>
      </div>`).join('') : emptyState('🔔', 'No notifications yet', 'Updates about your jobs and messages will show up here.');
  } catch (e) {
    root.querySelector('#notif-list').innerHTML = emptyState('⚠️', 'Could not load notifications', e.message);
  }

  root.querySelector('#mark-all').addEventListener('click', async () => {
    await api.post('/notifications/read-all');
    refreshNotificationCount();
    renderNotifications(root);
  });
}
