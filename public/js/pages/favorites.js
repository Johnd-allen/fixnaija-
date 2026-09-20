import { api } from '../api.js';
import { renderChrome, providerCardHtml, emptyState, skeletonCards, requireLogin } from '../components.js';

export async function renderFavorites(root) {
  if (!requireLogin('customer')) return;
  root.innerHTML = `<div class="screen"><h2>Saved professionals</h2><div id="fav-list" style="margin-top:14px;">${skeletonCards(3)}</div></div>`;
  renderChrome(root, '/profile');
  try {
    const rows = await api.get('/favorites');
    const list = root.querySelector('#fav-list');
    list.innerHTML = rows.length ? rows.map(providerCardHtml).join('') : emptyState('☆', 'No favorites yet', 'Tap "Save" on a professional\u2019s profile to find them here later.');
  } catch (e) {
    root.querySelector('#fav-list').innerHTML = emptyState('⚠️', 'Could not load favorites', e.message);
  }
}
