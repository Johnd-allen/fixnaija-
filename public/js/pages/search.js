import { api, qs } from '../api.js';
import { state } from '../state.js';
import { renderChrome, providerCardHtml, skeletonCards, emptyState } from '../components.js';

export async function renderSearch(root, params, query) {
  root.innerHTML = `
    <div class="screen">
      <div class="field">
        <input id="s-search" type="text" placeholder="What service do you need?" value="${query.search || ''}" />
      </div>
      <div class="tabs" id="cat-tabs">
        <div class="tab ${!query.category ? 'active' : ''}" data-cat="">All</div>
        ${state.categories.map((c) => `<div class="tab ${query.category === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</div>`).join('')}
      </div>
      <div class="row-2">
        <div class="field">
          <select id="s-state">
            <option value="">Any state</option>
          </select>
        </div>
        <div class="field">
          <select id="s-rating">
            <option value="">Any rating</option>
            <option value="4">4★ and above</option>
            <option value="3">3★ and above</option>
          </select>
        </div>
      </div>
      <div class="row-2">
        <div class="field">
          <select id="s-sort">
            <option value="rating">Top rated</option>
            <option value="experience">Most experienced</option>
            <option value="price">Lowest price</option>
            <option value="jobs">Most jobs done</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
            <input type="checkbox" id="s-verified" style="width:auto;" /> Verified only
          </label>
        </div>
      </div>
      <div id="results">${skeletonCards(4)}</div>
    </div>`;

  renderChrome(root, '/search');

  const stateSelect = root.querySelector('#s-state');
  try {
    const states = await api.get('/locations/states');
    stateSelect.innerHTML = '<option value="">Any state</option>' + states.map((s) => `<option value="${s}" ${query.state === s ? 'selected' : ''}>${s}</option>`).join('');
  } catch { /* ignore */ }

  root.querySelector('#s-sort').value = query.sort || 'rating';
  if (query.minRating) root.querySelector('#s-rating').value = query.minRating;
  if (query.verifiedOnly === 'true') root.querySelector('#s-verified').checked = true;

  let currentCategory = query.category || '';

  async function runSearch() {
    const resultsEl = root.querySelector('#results');
    resultsEl.innerHTML = skeletonCards(4);
    const params2 = {
      search: root.querySelector('#s-search').value.trim() || undefined,
      category: currentCategory || undefined,
      state: stateSelect.value || undefined,
      minRating: root.querySelector('#s-rating').value || undefined,
      sort: root.querySelector('#s-sort').value || undefined,
      verifiedOnly: root.querySelector('#s-verified').checked ? 'true' : undefined,
      city: query.city || undefined,
    };
    try {
      const rows = await api.get('/providers' + qs(params2));
      if (!resultsEl.isConnected) return;
      resultsEl.innerHTML = rows.length
        ? rows.map(providerCardHtml).join('')
        : emptyState('🔍', 'No professionals found', 'Try widening your filters or checking another area.');
    } catch (e) {
      resultsEl.innerHTML = emptyState('⚠️', 'Search failed', e.message);
    }
  }

  root.querySelectorAll('#cat-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentCategory = tab.dataset.cat;
      root.querySelectorAll('#cat-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      runSearch();
    });
  });
  ['#s-state', '#s-rating', '#s-sort', '#s-verified'].forEach((sel) => {
    root.querySelector(sel).addEventListener('change', runSearch);
  });
  let searchTimer;
  root.querySelector('#s-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 350);
  });

  runSearch();
}
